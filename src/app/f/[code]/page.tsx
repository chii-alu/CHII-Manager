import { notFound } from "next/navigation";
import { createPublicClient } from "@/lib/supabase/public";
import { publicFields, type FieldSpec, type PublicFormKind } from "@/lib/forms/fields";
import { questionsSchema } from "@/lib/forms/questions";
import { formatDate, formatDateRange } from "@/lib/dates";
import { PublicForm } from "@/components/forms/PublicForm";
import { card } from "@/components/ui/styles";
import { MASTERCLASS_TEMPLATE_ID } from "@/lib/forms/registration";

type PublicFormData = {
  code: string;
  kind: PublicFormKind;
  status: "draft" | "open" | "closed";
  questions: unknown;
  template: string | null;
  pillar: string;
  intervention: string;
  session: {
    id: string;
    title: string;
    kind: "registration" | "application";
    dates: string[];
    mode: string | null;
    venue: string | null;
    application_deadline: string | null;
    capacity: number | null;
  };
  today: string;
};

const KIND_TITLE: Record<PublicFormKind, string> = {
  intake: "Registration",
  attendance: "Check-in",
  feedback: "Feedback",
  employer_feedback: "Employer feedback",
};

export default async function PublicFormPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { data, error } = await createPublicClient().rpc("get_public_form", { p_code: code });
  if (error) throw new Error("This form could not be loaded. Please try again.");
  if (!data) notFound();

  const form = data as PublicFormData;
  const s = form.session;
  const selective = s.kind === "application";
  const title = selective && form.kind === "intake" ? "Application" : KIND_TITLE[form.kind];

  const closedMessage = form.status !== "open" ? "This form is not accepting responses." : null;
  const deadlinePassed =
    selective && form.kind === "intake" && s.application_deadline && form.today > s.application_deadline
      ? `Applications closed on ${formatDate(s.application_deadline)}.`
      : null;

  return (
    <main className="mx-auto max-w-xl px-4 py-8 sm:py-12">
      <header className="flex flex-col gap-1.5">
        <p className="text-sm text-muted">
          {form.pillar} · {form.intervention}
        </p>
        <h1 className="font-display text-2xl font-semibold">
          {title}: {s.title}
        </h1>
        <p className="text-sm text-muted">
          {formatDateRange(s.dates)}
          {s.mode ? ` · ${s.mode}` : ""}
          {s.venue ? ` · ${s.venue}` : ""}
        </p>
        <p className="font-mono text-xs text-muted">{form.code}</p>
      </header>

      <div className="mt-6">
        {closedMessage || deadlinePassed ? (
          <div className={`${card} text-center`}>
            <p className="font-semibold">{deadlinePassed ?? closedMessage}</p>
          </div>
        ) : (
          <PublicForm
            code={form.code}
            kind={form.kind}
            fields={buildFields(form)}
            defaults={defaultsFor(form)}
            selective={selective}
          />
        )}
      </div>
    </main>
  );
}

function buildFields(form: PublicFormData): FieldSpec[] {
  // A feedback template is the whole form, and the lookup returns its questions.
  if ((form.kind === "feedback" || form.kind === "employer_feedback") && form.template === "feedback_template") {
    return (form.questions ?? []) as FieldSpec[];
  }
  // A masterclass template is the whole form: no standard questions are added.
  if (form.kind === "intake" && form.template === MASTERCLASS_TEMPLATE_ID) return form.questions as FieldSpec[];
  const questions = questionsSchema.safeParse(form.questions);
  return publicFields(form.kind, questions.success ? questions.data : [], form.session.dates);
}

// Attendance defaults to today if it is a session date, else the last session date so far, else the first.
function defaultsFor(form: PublicFormData): Record<string, unknown> {
  if (form.kind !== "attendance") return {};
  const dates = [...form.session.dates].sort();
  const today = form.today;
  const day = dates.includes(today) ? today : dates.filter((d) => d <= today).pop() ?? dates[0];
  return { day };
}
