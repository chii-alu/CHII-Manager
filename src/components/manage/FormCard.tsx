"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setFormStatus } from "@/app/manage/actions";
import { btnSm, card, input } from "@/components/ui/styles";
import type { FieldSpec as CoreQuestion, FieldSpec } from "@/lib/forms/fields";
import type { Question } from "@/lib/forms/questions";
import { QuestionEditor } from "./QuestionEditor";
import { ShareDialog } from "./ShareDialog";
import { PreviewDialog } from "./PreviewDialog";
import type { FieldOption } from "@/lib/forms/questions";

export const FORM_STATUS_LABEL = { draft: "Draft", open: "Open", closed: "Closed" } as const;
const STATUS_CLASS = { draft: "bg-sunk text-muted", open: "bg-ok-soft text-ok-ink", closed: "bg-bad-soft text-bad-ink" } as const;

export type FormKind = "intake" | "attendance" | "feedback" | "employer_feedback";
export type FormStatus = keyof typeof FORM_STATUS_LABEL;

export function FormCard({
  sessionId,
  sessionTitle,
  kind,
  title,
  description,
  code,
  status,
  count,
  countLabel,
  customQuestions,
  core,
  previewFields,
  locked = false,
  fields = [],
  pillar = "",
  canCreateGlobal = false,
}: {
  sessionId: string;
  sessionTitle: string;
  kind: FormKind;
  title: string;
  description: string;
  code: string;
  status: FormStatus;
  count: number;
  countLabel: string;
  customQuestions?: Question[];
  core?: CoreQuestion[];
  previewFields: FieldSpec[];
  // A form built from a fixed template: it can be previewed and shared, but its questions cannot be edited here.
  locked?: boolean;
  // The dictionary fields this form may use, and where new fields for it go.
  fields?: FieldOption[];
  pillar?: string;
  canCreateGlobal?: boolean;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState<FormStatus>(status);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const editable = kind !== "attendance" && !locked;

  const changeStatus = async (next: FormStatus) => {
    setError(null);
    const previous = current;
    setCurrent(next);
    const result = await setFormStatus(sessionId, kind, next);
    if (!result.ok) {
      setCurrent(previous);
      setError(result.error);
      return;
    }
    router.refresh();
  };

  return (
    <article className={`${card} flex flex-col gap-3`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-base font-semibold">{title}</h3>
          <div className="font-mono text-xs text-muted">{code}</div>
        </div>
        <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${STATUS_CLASS[current]}`}>{FORM_STATUS_LABEL[current]}</span>
      </div>
      <p className="text-sm text-muted">{description}</p>
      <div className="text-sm">
        <b className="tabular-nums">{count}</b> <span className="text-muted">{countLabel}</span>
      </div>

      <label className="flex items-center gap-2 text-sm text-muted">
        Status
        <select
          className={`${input} w-auto py-1 text-sm text-ink`}
          value={current}
          onChange={(e) => changeStatus(e.target.value as FormStatus)}
          aria-label={`${title} status`}
        >
          {(Object.keys(FORM_STATUS_LABEL) as FormStatus[]).map((s) => (
            <option key={s} value={s}>
              {FORM_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </label>

      {error && (
        <p role="alert" className="rounded-md bg-bad-soft p-2 text-sm text-bad-ink">
          {error}
        </p>
      )}

      <div className="mt-auto flex flex-wrap gap-2 pt-1">
        {editable && (
          <button type="button" className={btnSm} onClick={() => setEditOpen(true)}>
            Edit questions
          </button>
        )}
        <button type="button" className={btnSm} onClick={() => setPreviewOpen(true)}>
          Preview and test
        </button>
        <button type="button" className={btnSm} onClick={() => setShareOpen(true)}>
          Share link / QR
        </button>
      </div>

      {editable && kind !== "employer_feedback" && (
        <QuestionEditor
          open={editOpen}
          onClose={() => setEditOpen(false)}
          sessionId={sessionId}
          kind={kind}
          title={`${title}: questions`}
          sessionTitle={sessionTitle}
          core={core ?? []}
          initial={customQuestions ?? []}
          fields={fields}
          pillar={pillar}
          canCreateGlobal={canCreateGlobal}
        />
      )}
      <PreviewDialog
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title={title}
        description={sessionTitle}
        fields={previewFields}
      />
      <ShareDialog
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        code={code}
        title={`${title} link`}
        description={sessionTitle}
        status={current}
      />
    </article>
  );
}
