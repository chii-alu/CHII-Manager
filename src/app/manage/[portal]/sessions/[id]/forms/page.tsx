import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FormCard, type FormStatus } from "@/components/manage/FormCard";
import { RubricCard } from "@/components/manage/RubricEditor";
import { ReviewersCard, type Person } from "@/components/manage/ReviewersCard";
import { INTAKE_CORE, FEEDBACK_CORE } from "@/lib/forms/core-questions";
import { questionsSchema, type Question } from "@/lib/forms/questions";
import { publicFields, type FieldSpec } from "@/lib/forms/fields";
import type { FieldOption } from "@/lib/forms/questions";
import { MASTERCLASS_TEMPLATE_ID } from "@/lib/forms/registration";
import { requireTab } from "@/lib/sessions/guard";

export default async function SessionFormsPage({ params }: { params: Promise<{ portal: string; id: string }> }) {
  const { portal, id } = await params;
  await requireTab("forms", id, portal);
  const supabase = await createClient();

  const { data: s } = await supabase.from("sessions").select("id, title, kind, dates, pillar, intervention_id").eq("id", id).maybeSingle();
  if (!s) notFound();
  const selective = s.kind === "application";

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: me } = user ? await supabase.from("staff_roles").select("role").eq("user_id", user.id).maybeSingle() : { data: null };
  const canManageReviewers = me?.role !== undefined && me.role !== "reviewer";

  const [{ data: forms }, { data: rubric }, entries, attendance, feedback, { data: reviewerRows }, { data: staffRows }] = await Promise.all([
    supabase.from("forms").select("kind, code, status, questions, template").eq("session_id", id),
    supabase.from("rubric_criteria").select("name, weight, position").eq("session_id", id).order("position"),
    supabase.from("entries").select("id", { count: "exact", head: true }).eq("session_id", id),
    supabase.from("attendance").select("session_id", { count: "exact", head: true }).eq("session_id", id),
    supabase.from("feedback").select("id", { count: "exact", head: true }).eq("session_id", id),
    supabase.from("session_reviewers").select("user_id").eq("session_id", id),
    supabase.rpc("assignable_staff", { p_session_id: id }),
  ]);

  // Fields the editor may use for this session: shared fields and this pillar's own, for this kind of form.
  const { data: fieldRows } = await supabase
    .from("field")
    .select("field_key, label, type, options, scope, pillar, domain")
    .eq("archived", false)
    .order("label");
  const fieldsFor = (domain: "registration" | "feedback") =>
    ((fieldRows ?? []) as { field_key: string; label: string; type: string; options: string[]; scope: "global" | "pillar" | "intervention"; pillar: string | null; domain: string }[])
      .filter((f) => f.domain === domain && (f.scope === "global" || f.pillar === s.pillar))
      .map((f) => ({ key: f.field_key, label: f.label, type: f.type as FieldOption["type"], options: f.options ?? [], scope: f.scope, pillar: f.pillar }));
  const canCreateGlobal = me?.role === "admin";

  // Feedback templates for this intervention: one for interns, one for employers (if it has them).
  const { data: templates } = await supabase.from("feedback_template").select("audience, questions").eq("intervention_id", s.intervention_id);
  const templateFor = (audience: "intern" | "employer") =>
    ((templates ?? []).find((t) => t.audience === audience)?.questions ?? []) as FieldSpec[];

  const byKind = Object.fromEntries((forms ?? []).map((f) => [f.kind, f]));
  const intake = byKind.intake;
  const attend = byKind.attendance;
  const feed = byKind.feedback;
  if (!intake || !attend || !feed) notFound();

  const customQuestions = (value: unknown): Question[] => {
    const parsed = questionsSchema.safeParse(value);
    return parsed.success ? parsed.data : [];
  };
  const staff: Person[] = ((staffRows ?? []) as { user_id: string; email: string; role: string }[]).map((r) => ({
    userId: r.user_id,
    email: r.email,
    role: r.role,
  }));
  const assignedIds = new Set((reviewerRows ?? []).map((r) => r.user_id));
  const assignedPeople = staff.filter((p) => assignedIds.has(p.userId));
  const candidatePeople = staff.filter((p) => !assignedIds.has(p.userId));

  const isTemplate = intake.template === MASTERCLASS_TEMPLATE_ID;
  const intakeQs = customQuestions(intake.questions);
  const templateFields = (intake.questions ?? []) as FieldSpec[];
  const feedbackFromTemplate = feed.template === "feedback_template";
  const feedbackQs = customQuestions(feed.questions);
  const employer = byKind.employer_feedback;
  const employerCount = employer
    ? (await supabase.from("employer_feedback").select("id", { count: "exact", head: true }).eq("session_id", id)).count ?? 0
    : 0;
  const dates = [...s.dates].sort();

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <FormCard
          sessionId={id}
          sessionTitle={s.title}
          kind="intake"
          title={selective ? "Application form" : "Registration form"}
          description={
            isTemplate
              ? "Masterclass registration template. Students are asked only what applies to them (ALU, ALX or Other)."
              : `${INTAKE_CORE.length} standard fields + ${intakeQs.length} question${intakeQs.length === 1 ? "" : "s"} for this session.`
          }
          code={intake.code}
          status={intake.status as FormStatus}
          count={entries.count ?? 0}
          countLabel={selective ? "applications received" : "registrations received"}
          customQuestions={intakeQs}
          fields={fieldsFor("registration")}
          pillar={s.pillar}
          canCreateGlobal={canCreateGlobal}
          core={isTemplate ? [] : INTAKE_CORE}
          previewFields={isTemplate ? templateFields : publicFields("intake", intakeQs, dates)}
          locked={isTemplate}
        />
        <FormCard
          sessionId={id}
          sessionTitle={s.title}
          kind="attendance"
          title="Check-in form"
          description={`Participants enter their email and pick the date. Only ${selective ? "selected applicants" : "registered participants"} can check in.`}
          code={attend.code}
          status={attend.status as FormStatus}
          count={attendance.count ?? 0}
          countLabel="check-ins recorded"
          previewFields={publicFields("attendance", [], dates)}
        />
        <FormCard
          sessionId={id}
          sessionTitle={s.title}
          kind="feedback"
          title="Feedback form"
          code={feed.code}
          status={feed.status as FormStatus}
          count={feedback.count ?? 0}
          countLabel="responses"
          customQuestions={feedbackFromTemplate ? [] : feedbackQs}
          fields={fieldsFor("feedback")}
          pillar={s.pillar}
          canCreateGlobal={canCreateGlobal}
          core={feedbackFromTemplate ? [] : FEEDBACK_CORE}
          previewFields={feedbackFromTemplate ? templateFor("intern") : publicFields("feedback", feedbackQs, dates)}
          locked={feedbackFromTemplate}
          description={
            feedbackFromTemplate
              ? "Built from the intervention's intern feedback template. Questions are changed in the template, not per session."
              : `${FEEDBACK_CORE.length} standard questions shared across all pillars + ${feedbackQs.length} for this session.`
          }
        />
        {employer && (
          <FormCard
            sessionId={id}
            sessionTitle={s.title}
            kind="employer_feedback"
            title="Employer feedback form"
            description="Built from the intervention's employer feedback template. Employers rate the student by their student email."
            code={employer.code}
            status={employer.status as FormStatus}
            count={employerCount}
            countLabel="employer responses"
            previewFields={templateFor("employer")}
            locked
          />
        )}
      </div>

      {selective && (
        <ReviewersCard
          sessionId={id}
          assigned={assignedPeople}
          candidates={candidatePeople}
          canManage={canManageReviewers}
        />
      )}

      {selective && <RubricCard sessionId={id} sessionTitle={s.title} criteria={(rubric ?? []).map((r) => ({ name: r.name, weight: r.weight }))} />}
    </div>
  );
}
