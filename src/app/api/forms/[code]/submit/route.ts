import { NextResponse, type NextRequest } from "next/server";
import { createPublicClient } from "@/lib/supabase/public";
import { allowRequest } from "@/lib/rate-limit";
import { publicFields, validateAnswers, buildValuesSchema, type FieldSpec } from "@/lib/forms/fields";
import { MASTERCLASS_TEMPLATE_ID, splitRegistration } from "@/lib/forms/registration";
import { questionsSchema } from "@/lib/forms/questions";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 32_000;
const LIMIT_PER_MINUTE = 20;

type PublicForm = {
  code: string;
  kind: "intake" | "attendance" | "feedback" | "employer_feedback";
  status: "draft" | "open" | "closed";
  questions: unknown;
  template: string | null;
  session: { dates: string[]; kind: string; application_deadline: string | null };
};

const error = (status: number, message: string, fieldErrors?: Record<string, string>) =>
  NextResponse.json({ ok: false, error: message, fieldErrors }, { status });

function validationError(issues: { path: PropertyKey[]; message: string }[]) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0]);
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return error(400, "Some answers need attention.", fieldErrors);
}

// Postgres error codes raised by the §4 rules (see public_form_rpcs migration).
function fromDbError(e: { code?: string; message: string }) {
  if (e.code === "P0002") return error(404, e.message);
  if (e.code === "23505") return error(409, e.message);
  if (e.code === "P0001" || e.code === "22023") return error(422, e.message);
  console.error("public submission failed", e);
  return error(500, "Something went wrong. Please try again.");
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;

  const supabase = createPublicClient();
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  try {
    if (!(await allowRequest(supabase, `${ip}:${code}`, LIMIT_PER_MINUTE))) {
      return error(429, "Too many attempts. Wait a minute and try again.");
    }
  } catch (e) {
    console.error("rate limiter unavailable", e);
    return error(503, "The form is busy right now. Please try again in a moment.");
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return error(413, "That submission is too large.");
  let body: { values?: unknown; website?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return error(400, "Could not read the form.");
  }

  // Honeypot: real visitors never fill the hidden "website" field. Pretend success and store nothing.
  if (typeof body.website === "string" && body.website.trim() !== "") {
    return NextResponse.json({ ok: true, data: { pid: null, status: "registered", returning: false } });
  }

  const { data: form, error: formError } = await supabase.rpc("get_public_form", { p_code: code });
  if (formError) return fromDbError(formError);
  if (!form) return error(404, "This form does not exist.");

  const f = form as PublicForm;
  if (f.status !== "open") return error(409, "This form is not accepting responses");

  const values = typeof body.values === "object" && body.values ? (body.values as Record<string, unknown>) : {};

  // A masterclass registration: its own questions, branching, and its own registration rules.
  if (f.kind === "intake" && f.template === MASTERCLASS_TEMPLATE_ID) {
    const template = validateAnswers(f.questions as FieldSpec[], values);
    if (!template.success) return validationError(template.error.issues);
    const { profile, registration } = splitRegistration(template.data as Record<string, unknown>);
    const { data, error: rpcError } = await supabase.rpc("submit_session_registration", {
      p_code: code,
      p_profile: profile,
      p_answers: registration,
    });
    if (rpcError) return fromDbError(rpcError);
    return NextResponse.json({ ok: true, data });
  }

  // A feedback form built from a template: its own questions, saved with the person's feedback.
  if ((f.kind === "feedback" || f.kind === "employer_feedback") && f.template === "feedback_template") {
    const templated = validateAnswers((f.questions ?? []) as FieldSpec[], values);
    if (!templated.success) return validationError(templated.error.issues);
    const answers = templated.data as Record<string, unknown>;
    const who = f.kind === "employer_feedback" ? answers.student_email : answers.email;
    const { data, error: rpcError } = await supabase.rpc("submit_template_feedback", {
      p_code: code,
      p_email: typeof who === "string" ? who : "",
      p_answers: answers,
    });
    if (rpcError) return fromDbError(rpcError);
    return NextResponse.json({ ok: true, data });
  }

  const questions = questionsSchema.safeParse(f.questions);
  const fields: FieldSpec[] = publicFields(f.kind, questions.success ? questions.data : [], f.session.dates);
  const parsed = buildValuesSchema(fields).safeParse(values);
  if (!parsed.success) return validationError(parsed.error.issues);
  const v = parsed.data as Record<string, unknown>;

  // Only the custom questions' answers are stored, keyed by question id (SPEC §3, §5).
  const customIds = new Set(fields.map((x) => x.id).filter((id) => !isStandardId(id, f.kind)));
  const answers = Object.fromEntries(Object.entries(v).filter(([k]) => customIds.has(k)));

  if (f.kind === "intake") {
    const profile = {
      name: v.name,
      email: v.email,
      phone: v.phone,
      gender: v.gender,
      age: v.age,
      country: v.country,
      affiliation: v.affiliation,
      disability: v.disability,
      consent: v.consent,
    };
    const { data, error: rpcError } = await supabase.rpc("submit_intake", {
      p_code: code,
      p_profile: profile,
      p_answers: answers,
    });
    if (rpcError) return fromDbError(rpcError);
    return NextResponse.json({ ok: true, data });
  }

  if (f.kind === "attendance") {
    const { data, error: rpcError } = await supabase.rpc("submit_checkin", {
      p_code: code,
      p_email: v.email,
      p_date: v.day,
    });
    if (rpcError) return fromDbError(rpcError);
    return NextResponse.json({ ok: true, data });
  }

  const { data, error: rpcError } = await supabase.rpc("submit_feedback", {
    p_code: code,
    p_email: v.email,
    p_satisfaction: v.sat,
    p_relevance: v.rel,
    p_nps: v.nps,
    p_most_useful: v.learn ?? null,
    p_improve: v.improve ?? null,
    p_answers: answers,
  });
  if (rpcError) return fromDbError(rpcError);
  return NextResponse.json({ ok: true, data });
}

// Standard question ids per form kind, so they are not stored as custom answers.
function isStandardId(id: string, kind: PublicForm["kind"]) {
  const standard =
    kind === "intake"
      ? ["name", "email", "phone", "gender", "age", "country", "affiliation", "disability", "consent"]
      : kind === "feedback"
        ? ["email", "sat", "rel", "nps", "learn", "improve"]
        : ["email", "day"];
  return standard.includes(id);
}
