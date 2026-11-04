"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { defaultFeedbackQuestions, defaultIntakeQuestions, DEFAULT_RUBRIC, type Pillar, type SessionKind } from "@/lib/forms/defaults";
import { formKindSchema, formStatusSchema, questionsSchema, rubricSchema, sessionInputSchema, type SessionInput } from "@/lib/sessions/schema";
import { FIELD_KEY_PATTERN, type Question } from "@/lib/forms/questions";
import { z } from "zod";
import { ENTRY_STATUSES, type EntryStatus } from "@/lib/sessions/status";
import { formatDate, formatDateRange, isIsoDate } from "@/lib/dates";
import { notifyText } from "@/lib/notify";
import { sendEmail } from "@/lib/email/send";

// Server Actions return a result instead of throwing, so forms can show the message.
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

// Postgres errors that matter to staff, in plain words.
function explain(error: { code?: string; message: string }) {
  if (error.code === "42501" || /row-level security/i.test(error.message)) {
    return "You do not have access to this pillar.";
  }
  // Not-found errors raised by our functions name what is missing, e.g. "No account exists for ...".
  if (error.code === "P0002") return error.message;
  return error.message;
}

async function signedInClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? supabase : null;
}

// Copy custom questions with fresh ids, so each session's answer keys stay unique.
function withFreshIds(questions: Question[]): Question[] {
  return questions.map((q) => ({ ...q, id: randomUUID() }));
}

const parseQuestions = (value: unknown): Question[] => {
  const parsed = questionsSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
};

export async function createSession(input: {
  interventionId: string;
  session: SessionInput;
  copyFromSessionId: string | null;
}): Promise<ActionResult<{ sessionId: string }>> {
  const supabase = await signedInClient();
  if (!supabase) return fail("Please sign in again.");

  const values = sessionInputSchema.safeParse(input.session);
  if (!values.success) return fail(values.error.issues[0].message);

  const { data: iv, error: ivError } = await supabase
    .from("interventions")
    .select("id, pillar, type")
    .eq("id", input.interventionId)
    .maybeSingle();
  if (ivError || !iv) return fail("That intervention could not be found.");

  const kind: SessionKind = iv.type === "selective" ? "application" : "registration";
  const pillar = iv.pillar as Pillar;

  // "Start forms from": copy from a previous session of the same intervention, or use the pillar template.
  let intake = defaultIntakeQuestions(pillar, kind);
  let feedback = defaultFeedbackQuestions(pillar);
  let rubric: { name: string; weight: number }[] | null = kind === "application" ? DEFAULT_RUBRIC : null;

  if (input.copyFromSessionId) {
    const { data: src, error: srcError } = await supabase
      .from("sessions")
      .select("kind, forms(kind, questions), rubric_criteria(name, weight, position)")
      .eq("id", input.copyFromSessionId)
      .maybeSingle();
    if (srcError || !src) return fail("The session to copy from could not be found.");

    const forms = src.forms as { kind: string; questions: unknown }[];
    const srcIntake = parseQuestions(forms.find((f) => f.kind === "intake")?.questions);
    const srcFeedback = parseQuestions(forms.find((f) => f.kind === "feedback")?.questions);
    // Intake questions carry over only when the kind matches (SPEC §4.4 applies to new sessions only).
    if (src.kind === kind) intake = withFreshIds(srcIntake);
    feedback = withFreshIds(srcFeedback);
    if (kind === "application") {
      const crit = (src.rubric_criteria as { name: string; weight: number; position: number | null }[]) ?? [];
      if (crit.length) {
        rubric = crit
          .slice()
          .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
          .map((c) => ({ name: c.name, weight: c.weight }));
      }
    }
  }

  const v = values.data;
  const { data: sessionId, error } = await supabase.rpc("create_session", {
    p_intervention_id: iv.id,
    p_title: v.title,
    p_dates: v.dates,
    p_mode: v.mode,
    p_venue: v.venue,
    p_facilitator: v.facilitator,
    p_capacity: v.capacity,
    p_application_deadline: v.applicationDeadline,
    p_intake_questions: intake,
    p_feedback_questions: feedback,
    p_rubric: rubric,
  });
  if (error || !sessionId) return fail(error ? explain(error) : "The session could not be created.");

  revalidatePath("/manage", "layout");
  revalidatePath("/manage", "layout");
  return { ok: true, data: { sessionId: sessionId as string } };
}

export async function updateSession(sessionId: string, input: SessionInput): Promise<ActionResult> {
  const supabase = await signedInClient();
  if (!supabase) return fail("Please sign in again.");

  const values = sessionInputSchema.safeParse(input);
  if (!values.success) return fail(values.error.issues[0].message);
  const v = values.data;

  const { data, error } = await supabase
    .from("sessions")
    .update({
      title: v.title,
      dates: v.dates,
      mode: v.mode,
      capacity: v.capacity,
      venue: v.venue || null,
      facilitator: v.facilitator || null,
      application_deadline: v.applicationDeadline,
    })
    .eq("id", sessionId)
    .select("intervention_id");
  if (error) return fail(explain(error));
  if (!data || data.length === 0) return fail("That session could not be updated.");

  revalidatePath("/manage", "layout");
  revalidatePath("/manage", "layout");
  return { ok: true, data: undefined };
}

export async function deleteSession(sessionId: string): Promise<ActionResult<{ interventionId: string }>> {
  const supabase = await signedInClient();
  if (!supabase) return fail("Please sign in again.");

  const { data, error } = await supabase.from("sessions").delete().eq("id", sessionId).select("intervention_id");
  if (error) return fail(explain(error));
  if (!data || data.length === 0) return fail("That session could not be deleted.");

  revalidatePath("/manage", "layout");
  revalidatePath("/manage", "layout");
  return { ok: true, data: { interventionId: data[0].intervention_id } };
}

export async function setFormStatus(
  sessionId: string,
  kind: "intake" | "attendance" | "feedback" | "employer_feedback",
  status: string,
): Promise<ActionResult> {
  const supabase = await signedInClient();
  if (!supabase) return fail("Please sign in again.");

  const parsed = formStatusSchema.safeParse(status);
  if (!parsed.success) return fail("Unknown form status.");

  const { data, error } = await supabase
    .from("forms")
    .update({ status: parsed.data })
    .eq("session_id", sessionId)
    .eq("kind", kind)
    .select("id");
  if (error) return fail(explain(error));
  if (!data || data.length === 0) return fail("That form could not be updated.");

  revalidatePath("/manage", "layout");
  return { ok: true, data: undefined };
}

export async function saveFormQuestions(
  sessionId: string,
  kind: "intake" | "feedback",
  questions: unknown,
): Promise<ActionResult> {
  const supabase = await signedInClient();
  if (!supabase) return fail("Please sign in again.");

  const kindCheck = formKindSchema.safeParse(kind);
  if (!kindCheck.success) return fail("Only registration/application and feedback forms take custom questions.");
  const parsed = questionsSchema.safeParse(questions);
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const { data, error } = await supabase
    .from("forms")
    .update({ questions: parsed.data })
    .eq("session_id", sessionId)
    .eq("kind", kind)
    .select("id");
  if (error) return fail(explain(error));
  if (!data || data.length === 0) return fail("That form could not be updated.");

  revalidatePath("/manage", "layout");
  return { ok: true, data: undefined };
}

export async function saveRubric(sessionId: string, criteria: unknown): Promise<ActionResult> {
  const supabase = await signedInClient();
  if (!supabase) return fail("Please sign in again.");

  const parsed = rubricSchema.safeParse(criteria);
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const { error } = await supabase.rpc("replace_rubric", { p_session_id: sessionId, p_criteria: parsed.data });
  if (error) return fail(explain(error));

  revalidatePath("/manage", "layout");
  return { ok: true, data: undefined };
}

// SPEC §4.4: changing an intervention's type affects only sessions created after the change.
export async function setInterventionType(interventionId: string, type: string): Promise<ActionResult> {
  const supabase = await signedInClient();
  if (!supabase) return fail("Please sign in again.");
  if (type !== "open" && type !== "selective") return fail("Choose open or selective.");

  const { data, error } = await supabase
    .from("interventions")
    .update({ type })
    .eq("id", interventionId)
    .select("id");
  if (error) return fail(explain(error));
  if (!data || data.length === 0) return fail("Only MELA admins can change an intervention's type.");

  revalidatePath("/manage", "layout");
  return { ok: true, data: undefined };
}

const uuidSchema = z.string().uuid();

// Per-row and bulk status changes. The database checks the status is valid for the session kind (§4.15).
export async function setEntryStatuses(sessionId: string, entryIds: string[], status: string): Promise<ActionResult<{ updated: number }>> {
  const supabase = await signedInClient();
  if (!supabase) return fail("Please sign in again.");

  const ids = z.array(uuidSchema).min(1).max(500).safeParse(entryIds);
  if (!ids.success) return fail("Choose at least one person.");
  const st = z.enum(ENTRY_STATUSES).safeParse(status);
  if (!st.success) return fail("Unknown status.");

  const { data, error } = await supabase.rpc("set_entry_statuses", {
    p_session_id: sessionId,
    p_entry_ids: ids.data,
    p_status: st.data,
  });
  if (error) return fail(explain(error));

  revalidatePath("/manage", "layout");
  return { ok: true, data: { updated: Number(data ?? 0) } };
}

// Save the signed-in reviewer's 1–5 score per criterion for one application.
export async function saveEntryScores(entryId: string, scores: Record<string, number>): Promise<ActionResult> {
  const supabase = await signedInClient();
  if (!supabase) return fail("Please sign in again.");

  const parsed = z
    .array(z.object({ criterion_id: uuidSchema, score: z.number().int().min(1).max(5) }))
    .safeParse(Object.entries(scores).map(([criterion_id, score]) => ({ criterion_id, score })));
  if (!parsed.success) return fail("Scores must be whole numbers from 1 to 5.");
  if (!uuidSchema.safeParse(entryId).success) return fail("That application could not be found.");

  const { error } = await supabase.rpc("save_scores", { p_entry_id: entryId, p_scores: parsed.data });
  if (error) return fail(explain(error));

  revalidatePath("/manage", "layout");
  return { ok: true, data: undefined };
}

// "Add manually": staff enter a registration or application on a participant's behalf.
export async function addEntryManually(sessionId: string, profile: Record<string, unknown>): Promise<ActionResult<{ pid: string; status: string }>> {
  const supabase = await signedInClient();
  if (!supabase) return fail("Please sign in again.");
  if (!uuidSchema.safeParse(sessionId).success) return fail("That session could not be found.");

  const { data, error } = await supabase.rpc("staff_add_entry", { p_session_id: sessionId, p_profile: profile });
  if (error) return fail(explain(error));

  revalidatePath("/manage", "layout");
  return { ok: true, data: data as { pid: string; status: string } };
}

const dateSchema = z.string().refine(isIsoDate, "Use a real date in YYYY-MM-DD form");

// Attendance: toggle one participant for one session date (SPEC §4.10, §7 "present toggles").
export async function setAttendance(sessionId: string, participantId: string, date: string, present: boolean): Promise<ActionResult> {
  const supabase = await signedInClient();
  if (!supabase) return fail("Please sign in again.");
  if (!uuidSchema.safeParse(sessionId).success || !uuidSchema.safeParse(participantId).success) return fail("Unknown record.");
  const d = dateSchema.safeParse(date);
  if (!d.success) return fail(d.error.issues[0].message);

  const { error } = await supabase.rpc("set_attendance", {
    p_session_id: sessionId,
    p_participant_id: participantId,
    p_date: d.data,
    p_present: present,
  });
  if (error) return fail(explain(error));

  revalidatePath("/manage", "layout");
  return { ok: true, data: undefined };
}

export async function markAllPresent(sessionId: string, date: string): Promise<ActionResult<{ marked: number }>> {
  const supabase = await signedInClient();
  if (!supabase) return fail("Please sign in again.");
  if (!uuidSchema.safeParse(sessionId).success) return fail("That session could not be found.");
  const d = dateSchema.safeParse(date);
  if (!d.success) return fail(d.error.issues[0].message);

  const { data, error } = await supabase.rpc("mark_all_present", { p_session_id: sessionId, p_date: d.data });
  if (error) return fail(explain(error));

  revalidatePath("/manage", "layout");
  return { ok: true, data: { marked: Number(data ?? 0) } };
}

// Walk-in at an open session (SPEC §4.11).
export async function addWalkin(sessionId: string, date: string, profile: Record<string, unknown>): Promise<ActionResult<{ pid: string }>> {
  const supabase = await signedInClient();
  if (!supabase) return fail("Please sign in again.");
  if (!uuidSchema.safeParse(sessionId).success) return fail("That session could not be found.");
  const d = dateSchema.safeParse(date);
  if (!d.success) return fail(d.error.issues[0].message);

  const { data, error } = await supabase.rpc("add_walkin", { p_session_id: sessionId, p_profile: profile, p_date: d.data });
  if (error) return fail(explain(error));

  revalidatePath("/manage", "layout");
  return { ok: true, data: { pid: (data as { pid: string }).pid } };
}

// Email the participant about their current status (SPEC §9). Every attempt is written to email_log.
export async function sendParticipantEmail(entryId: string): Promise<ActionResult<{ status: "sent" | "not_configured" }>> {
  const supabase = await signedInClient();
  if (!supabase) return fail("Please sign in again.");
  if (!uuidSchema.safeParse(entryId).success) return fail("That entry could not be found.");

  const { data: e, error: readError } = await supabase
    .from("entries")
    .select(
      "id, status, participant_id, session_id, participants(pid, name, email), sessions(title, pillar, dates, venue, application_deadline, interventions(name))",
    )
    .eq("id", entryId)
    .maybeSingle();
  if (readError || !e) return fail("That entry could not be found.");

  const p = e.participants as unknown as { pid: string; name: string; email: string };
  const s = e.sessions as unknown as {
    title: string;
    pillar: string;
    dates: string[];
    venue: string | null;
    application_deadline: string | null;
    interventions: { name: string };
  };

  const body = notifyText({
    firstName: p.name.split(" ")[0],
    pid: p.pid,
    sessionTitle: s.title,
    interventionName: s.interventions.name,
    pillar: s.pillar,
    datesText: formatDateRange(s.dates),
    venue: s.venue,
    deadline: s.application_deadline ? formatDate(s.application_deadline) : null,
    status: e.status as EntryStatus,
  });
  const subject = `${s.title}: update from ${s.pillar}`;

  const result = await sendEmail({ to: p.email, subject, text: body });

  const { data: user } = await supabase.auth.getUser();
  await supabase.from("email_log").insert({
    entry_id: e.id,
    participant_id: e.participant_id,
    to_email: p.email,
    subject,
    body,
    status: result.status === "sent" ? "sent" : result.status === "failed" ? "failed" : "not_configured",
    provider_message_id: result.status === "sent" ? result.providerMessageId : null,
    error: result.status === "failed" ? result.error : null,
    sent_by: user.user?.id ?? null,
  });

  if (result.status === "failed") return fail(result.error);
  return { ok: true, data: { status: result.status } };
}

// §8: remove a participant's personal details on request. Admin only; the database checks this too.
export async function anonymiseParticipant(pid: string): Promise<ActionResult> {
  const supabase = await signedInClient();
  if (!supabase) return fail("Please sign in again.");
  if (!/^MELA-\d{4,}$/.test(pid)) return fail("Unknown participant.");

  const { error } = await supabase.rpc("anonymise_participant", { p_pid: pid });
  if (error) return fail(explain(error));

  revalidatePath("/manage", "layout");
  return { ok: true, data: undefined };
}

// Reviewers (SPEC §8): pillar staff and admins assign reviewers to a selective session.
export async function assignReviewer(sessionId: string, userId: string): Promise<ActionResult> {
  const supabase = await signedInClient();
  if (!supabase) return fail("Please sign in again.");
  if (!uuidSchema.safeParse(sessionId).success || !uuidSchema.safeParse(userId).success) return fail("Unknown session or person.");

  const { data: me } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("session_reviewers")
    .insert({ session_id: sessionId, user_id: userId, assigned_by: me.user?.id ?? null });
  if (error) return fail(error.code === "23505" ? "This person is already a reviewer for this session." : explain(error));

  revalidatePath("/manage", "layout");
  return { ok: true, data: undefined };
}

export async function removeReviewer(sessionId: string, userId: string): Promise<ActionResult> {
  const supabase = await signedInClient();
  if (!supabase) return fail("Please sign in again.");
  if (!uuidSchema.safeParse(sessionId).success || !uuidSchema.safeParse(userId).success) return fail("Unknown session or person.");

  const { data, error } = await supabase
    .from("session_reviewers")
    .delete()
    .eq("session_id", sessionId)
    .eq("user_id", userId)
    .select("user_id");
  if (error) return fail(explain(error));
  if (!data || data.length === 0) return fail("That reviewer could not be removed.");

  revalidatePath("/manage", "layout");
  return { ok: true, data: undefined };
}

// Admin: grant or change a staff role for an existing account (SPEC §8).
export async function setStaffRole(email: string, role: string, pillars: string[]): Promise<ActionResult> {
  const supabase = await signedInClient();
  if (!supabase) return fail("Please sign in again.");

  const parsed = z
    .object({
      email: z.string().trim().email("Enter a valid email address.").max(254),
      role: z.enum(["admin", "pillar_lead", "pillar_staff", "reviewer"]),
      pillars: z.array(z.enum(["HENT", "HEMP", "HECO"])),
    })
    .safeParse({ email, role, pillars });
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const { error } = await supabase.rpc("set_staff_role", {
    p_email: parsed.data.email,
    p_role: parsed.data.role,
    p_pillars: parsed.data.pillars,
  });
  if (error) return fail(explain(error));

  revalidatePath("/manage", "layout");
  return { ok: true, data: undefined };
}

export async function removeStaff(userId: string): Promise<ActionResult> {
  const supabase = await signedInClient();
  if (!supabase) return fail("Please sign in again.");
  if (!uuidSchema.safeParse(userId).success) return fail("Unknown account.");

  const { error } = await supabase.rpc("remove_staff", { p_user_id: userId });
  if (error) return fail(explain(error));

  revalidatePath("/manage", "layout");
  return { ok: true, data: undefined };
}

// Admin: add an intervention to a pillar (SPEC §7 "+ Add intervention"). The database allows only admins to write.
export async function addIntervention(pillar: string, name: string, type: string): Promise<ActionResult<{ id: string }>> {
  const supabase = await signedInClient();
  if (!supabase) return fail("Please sign in again.");

  const parsed = z
    .object({
      pillar: z.enum(["HENT", "HEMP", "HECO"]),
      name: z.string().trim().min(2, "Give the intervention a name.").max(120),
      type: z.enum(["open", "selective"]),
    })
    .safeParse({ pillar, name, type });
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const { data, error } = await supabase
    .from("interventions")
    .insert({ pillar: parsed.data.pillar, name: parsed.data.name, type: parsed.data.type })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return fail(`${parsed.data.name} already exists in ${parsed.data.pillar}.`);
    if (error.code === "42501" || /row-level security/i.test(error.message)) return fail("Only MELA admins can add interventions.");
    return fail(explain(error));
  }

  revalidatePath("/manage", "layout");
  return { ok: true, data: { id: data.id } };
}

const FIELD_TYPES = ["text", "long", "number", "date", "single", "multi", "scale10", "yesno", "email"] as const;
const newFieldSchema = z
  .object({
    key: z.string().trim().regex(FIELD_KEY_PATTERN, "Use lowercase letters, numbers and underscores, starting with a letter."),
    label: z.string().trim().min(1, "Give the field a label.").max(200),
    type: z.enum(FIELD_TYPES),
    options: z.array(z.string().trim().min(1).max(120)).max(30),
    domain: z.enum(["registration", "feedback"]),
    // A pillar's own field, or a shared field (null), which only admins can create.
    pillar: z.enum(["HENT", "HEMP", "HECO"]).nullable(),
  })
  .superRefine((f, ctx) => {
    if ((f.type === "single" || f.type === "multi") && f.options.length === 0) {
      ctx.addIssue({ code: "custom", path: ["options"], message: "Add at least one option." });
    }
  });

export async function createField(input: unknown): Promise<ActionResult<{ key: string }>> {
  const supabase = await signedInClient();
  if (!supabase) return fail("Please sign in again.");

  const parsed = newFieldSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const f = parsed.data;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.from("field").insert({
    field_key: f.key,
    label: f.label,
    type: f.type,
    options: f.options,
    domain: f.domain,
    scope: f.pillar ? "pillar" : "global",
    pillar: f.pillar,
    created_by: user?.id ?? null,
  });
  if (error) {
    if (error.code === "23505") return fail("A field with that key already exists. Choose it from the list.");
    return fail(explain(error));
  }

  revalidatePath("/manage", "layout");
  return { ok: true, data: { key: f.key } };
}
