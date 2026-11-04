"use client";

import { useState } from "react";
import { DynamicForm, type FieldValues } from "@/components/forms/DynamicForm";
import { Dialog } from "@/components/ui/Dialog";
import { btn, btnPri } from "@/components/ui/styles";
import { validateAnswers, type FieldSpec } from "@/lib/forms/fields";

// SPEC §4.5 and §7: staff can try a form before sharing it. The preview validates exactly like the
// public form, but it never calls the database, so nothing is saved and the form status does not matter.
export function PreviewDialog({
  open,
  onClose,
  title,
  description,
  fields,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  fields: FieldSpec[];
}) {
  return (
    <Dialog open={open} onClose={onClose} title={`Preview: ${title}`} description={description} wide>
      {open && <PreviewBody fields={fields} onClose={onClose} />}
    </Dialog>
  );
}

function PreviewBody({ fields, onClose }: { fields: FieldSpec[]; onClose: () => void }) {
  const [values, setValues] = useState<FieldValues>({});
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [result, setResult] = useState<"idle" | "ok" | "invalid">("idle");

  const check = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = validateAnswers(fields, values);
    if (parsed.success) {
      setErrors({});
      setResult("ok");
      return;
    }
    const next: Record<string, string> = {};
    for (const issue of parsed.error.issues) next[String(issue.path[0])] ??= issue.message;
    setErrors(next);
    setResult("invalid");
  };

  return (
    <form onSubmit={check} noValidate className="flex flex-col gap-6">
      <p className="rounded-md bg-accent-soft p-3 text-sm text-accent">
        Preview only. Nothing is saved, and the form does not have to be open.
      </p>
      <DynamicForm
        fields={fields}
        values={values}
        errors={errors}
        onChange={(id, value) => {
          setValues((v) => ({ ...v, [id]: value }));
          setErrors((e) => ({ ...e, [id]: undefined }));
          setResult("idle");
        }}
      />
      {result === "ok" && <p role="status" className="rounded-md bg-ok-soft p-3 text-sm text-ok-ink">All required answers are valid. This is what the participant would send.</p>}
      {result === "invalid" && <p role="alert" className="rounded-md bg-bad-soft p-3 text-sm text-bad-ink">Some answers need attention.</p>}
      <div className="flex justify-end gap-2 border-t border-line pt-4">
        <button type="button" className={btn} onClick={onClose}>
          Close
        </button>
        <button type="submit" className={btnPri}>
          Check answers
        </button>
      </div>
    </form>
  );
}
