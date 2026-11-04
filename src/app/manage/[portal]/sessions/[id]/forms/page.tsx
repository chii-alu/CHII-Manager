import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FormCard, type FormStatus } from "@/components/manage/FormCard";
import { RubricCard } from "@/components/manage/RubricEditor";
import { ReviewersCard, type Person } from "@/components/manage/ReviewersCard";
import { INTAKE_CORE, FEEDBACK_CORE } from "@/lib/forms/core-questions";
import { questionsSchema, type Question } from "@/lib/forms/questions";
import { publicFields, type FieldSpec } from "@/lib/forms/fields";
import { MASTERCLASS_TEMPLATE_ID } from "@/lib/forms/registration";
import { requireTab } from "@/lib/sessions/guard";

export default async function SessionFormsPage({ params }: { params: Promise<{ portal: string; id: string }> }) {
  const { portal, id } = await params;
  await requireTab("forms", id, portal);
  const supabase = await createClient();

  const { data: s } = await supabase.from("sessions").select("id, title, kind, dates").eq("id", id).maybeSingle();
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
  const feedbackQs = customQuestions(feed.questions);
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
          description={`${FEEDBACK_CORE.length} standard questions shared across all pillars + ${feedbackQs.length} for this session.`}
          code={feed.code}
          status={feed.status as FormStatus}
          count={feedback.count ?? 0}
          countLabel="responses"
          customQuestions={feedbackQs}
          core={FEEDBACK_CORE}
          previewFields={publicFields("feedback", feedbackQs, dates)}
        />
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
