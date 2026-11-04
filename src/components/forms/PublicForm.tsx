"use client";

import { useState } from "react";
import { DynamicForm, type FieldValues } from "./DynamicForm";
import { validateAnswers, type FieldSpec, type PublicFormKind } from "@/lib/forms/fields";
import { btnPri, card } from "@/components/ui/styles";

type Result = { pid: string | null; status?: string; returning?: boolean; date?: string };

export function PublicForm({
  code,
  kind,
  fields,
  defaults,
  selective,
}: {
  code: string;
  kind: PublicFormKind;
  fields: FieldSpec[];
  defaults: FieldValues;
  selective: boolean;
}) {
  const [values, setValues] = useState<FieldValues>(defaults);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  // Honeypot: hidden from people, filled by bots. See the submit route.
  const [website, setWebsite] = useState("");

  const onChange = (id: string, value: unknown) => {
    setValues((v) => ({ ...v, [id]: value }));
    setErrors((e) => ({ ...e, [id]: undefined }));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const parsed = validateAnswers(fields, values);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[String(issue.path[0])] ??= issue.message;
      setErrors(next);
      setFormError("Some answers need attention.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/forms/${encodeURIComponent(code)}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ values, website }),
      });
      const body = await res.json().catch(() => ({ ok: false, error: "Something went wrong." }));
      if (!res.ok || !body.ok) {
        if (body.fieldErrors) setErrors(body.fieldErrors);
        setFormError(body.error ?? "Something went wrong. Please try again.");
        return;
      }
      setResult(body.data as Result);
    } catch {
      setFormError("Could not reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (result) return <Success kind={kind} selective={selective} result={result} />;

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      <DynamicForm fields={fields} values={values} errors={errors} onChange={onChange} />

      {/* Honeypot field: hidden from people and screen readers. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 overflow-hidden">
        <label>
          Website
          <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </label>
      </div>

      {formError && (
        <p role="alert" className="rounded-md bg-bad-soft p-3 text-sm text-bad-ink">
          {formError}
        </p>
      )}

      <button type="submit" className={`${btnPri} w-full py-3 text-base`} disabled={submitting}>
        {submitting ? "Sending…" : submitLabel(kind, selective)}
      </button>
    </form>
  );
}

function submitLabel(kind: PublicFormKind, selective: boolean) {
  if (kind === "attendance") return "Check in";
  if (kind === "feedback" || kind === "employer_feedback") return "Send feedback";
  return selective ? "Submit application" : "Register";
}

function Success({ kind, selective, result }: { kind: PublicFormKind; selective: boolean; result: Result }) {
  let heading = "Thank you.";
  let detail: React.ReactNode = null;

  if (kind === "attendance") {
    heading = "Checked in. Welcome!";
  } else if (kind === "feedback" || kind === "employer_feedback") {
    heading = "Thank you for your feedback.";
    detail = "Your response is linked to your attendance record.";
  } else if (selective) {
    heading = "Application received.";
  } else if (result.status === "waitlisted") {
    heading = "Added to the waitlist: the session is full.";
  } else {
    heading = "You are registered.";
  }

  return (
    <div role="status" className={`${card} flex flex-col gap-3`}>
      <h2 className="font-display text-xl font-semibold text-ok-ink">{heading}</h2>
      {detail && <p className="text-sm">{detail}</p>}
      {result.pid && (
        <p className="text-sm">
          Participant ID <span className="font-mono font-semibold">{result.pid}</span>
        </p>
      )}
      {kind === "intake" && result.returning && (
        <p className="text-sm text-muted">
          We matched your email to an existing participant record, so no duplicate was created.
        </p>
      )}
      {kind === "attendance" && result.date && <p className="text-sm text-muted">Session date: {result.date}</p>}
    </div>
  );
}
