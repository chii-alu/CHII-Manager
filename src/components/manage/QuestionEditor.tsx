"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createField, saveFormQuestions } from "@/app/manage/actions";
import { Dialog } from "@/components/ui/Dialog";
import { btn, btnPri, btnSm, input, label } from "@/components/ui/styles";
import { QUESTION_TYPE_LABELS, QUESTION_TYPES, type FieldOption, type Question, type QuestionType } from "@/lib/forms/questions";
import type { FieldSpec as CoreQuestion } from "@/lib/forms/fields";

const NEEDS_OPTIONS: QuestionType[] = ["single", "multi"];
const NEW_FIELD = "__new__";

// The field types a dictionary field can have (ratings are single choice with options).
const FIELD_TYPES: QuestionType[] = ["text", "long", "number", "date", "single", "multi", "scale10", "yesno", "email"];

export function QuestionEditor({
  open,
  onClose,
  sessionId,
  kind,
  title,
  sessionTitle,
  core,
  initial,
  fields,
  pillar,
  canCreateGlobal,
}: {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  kind: "intake" | "feedback";
  title: string;
  sessionTitle: string;
  core: CoreQuestion[];
  initial: Question[];
  fields: FieldOption[];
  pillar: string;
  canCreateGlobal: boolean;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={title} description={sessionTitle} wide>
      <QuestionEditorBody
        sessionId={sessionId}
        kind={kind}
        core={core}
        initial={initial}
        fields={fields}
        pillar={pillar}
        canCreateGlobal={canCreateGlobal}
        onClose={onClose}
      />
    </Dialog>
  );
}

// Draft state lives here, so it resets each time the dialog opens.
function QuestionEditorBody({
  sessionId,
  kind,
  core,
  initial,
  fields: initialFields,
  pillar,
  canCreateGlobal,
  onClose,
}: {
  sessionId: string;
  kind: "intake" | "feedback";
  core: CoreQuestion[];
  initial: Question[];
  fields: FieldOption[];
  pillar: string;
  canCreateGlobal: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [qs, setQs] = useState<Question[]>(() => initial.map((q) => ({ ...q, options: q.options ? [...q.options] : undefined })));
  const [fieldList, setFieldList] = useState<FieldOption[]>(initialFields);
  // The question a new field is being created for, or null.
  const [creatingFor, setCreatingFor] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const linkedKeys = new Set(fieldList.map((f) => f.key));
  const update = (i: number, patch: Partial<Question>) =>
    setQs((prev) => prev.map((q, ix) => (ix === i ? { ...q, ...patch } : q)));
  const move = (i: number, dir: -1 | 1) =>
    setQs((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const remove = (i: number) => setQs((prev) => prev.filter((_, ix) => ix !== i));
  const add = () => setQs((prev) => [...prev, { id: "", label: "", type: "text", required: false }]);

  // Picking a field fills in its key, label, type and options. The question then records the field's key.
  const pickField = (i: number, value: string) => {
    if (value === NEW_FIELD) {
      setCreatingFor(i);
      return;
    }
    const f = fieldList.find((x) => x.key === value);
    if (!f) return;
    update(i, {
      id: f.key,
      label: qs[i].label.trim() ? qs[i].label : f.label,
      type: f.type,
      options: NEEDS_OPTIONS.includes(f.type) ? (f.options.length ? [...f.options] : ["Option 1", "Option 2"]) : undefined,
    });
  };

  const save = async () => {
    setError(null);
    const unlinked = qs.filter((q) => !linkedKeys.has(q.id));
    if (unlinked.length > 0) {
      setError(`Link every question to a field: ${unlinked.map((q) => q.label.trim() || "(no label)").join(", ")}.`);
      return;
    }
    setSaving(true);
    const cleaned = qs.map((q) => ({
      ...q,
      label: q.label.trim(),
      options: NEEDS_OPTIONS.includes(q.type) ? (q.options ?? []).map((o) => o.trim()).filter(Boolean) : undefined,
    }));
    const result = await saveFormQuestions(sessionId, kind, cleaned);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
    onClose();
  };

  return (
    <div className="flex flex-col gap-5">
      <section>
        <h3 className="font-display text-base font-semibold">Standard questions</h3>
        <p className="text-sm text-muted">
          Locked on every {kind === "intake" ? "registration and application" : "feedback"} form, so answers compare across pillars.
        </p>
        <ul className="mt-2 flex flex-col gap-1.5">
          {core.map((c) => (
            <li key={c.id} className="flex items-start justify-between gap-3 rounded-md bg-sunk p-2.5 text-sm">
              <span>{c.label}</span>
              <span className="whitespace-nowrap text-muted">{c.type === "consent" ? "Consent" : c.required ? "Required" : "Optional"}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="font-display text-base font-semibold">Questions for this session</h3>
        <p className="text-sm text-muted">
          Each question uses a field from the dictionary. The same field keeps its column in every export.
        </p>
        {qs.length === 0 && <p className="mt-2 text-sm text-muted">No extra questions yet.</p>}
        <ol className="mt-2 flex flex-col gap-3">
          {qs.map((q, i) => {
            const linked = linkedKeys.has(q.id);
            return (
              <li key={i} className="rounded-md border border-line p-3">
                <div className="grid gap-2 sm:grid-cols-[200px_1fr_180px_auto]">
                  <select
                    className={input}
                    aria-label="Field"
                    value={linked ? q.id : ""}
                    onChange={(e) => pickField(i, e.target.value)}
                  >
                    <option value="" disabled>
                      {linked ? "" : "Choose a field"}
                    </option>
                    {fieldList.map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label}
                      </option>
                    ))}
                    <option value={NEW_FIELD}>+ Create a new field</option>
                  </select>
                  <input
                    className={input}
                    aria-label="Question text"
                    value={q.label}
                    onChange={(e) => update(i, { label: e.target.value })}
                  />
                  <select
                    className={input}
                    aria-label="Answer type"
                    value={q.type}
                    onChange={(e) => {
                      const type = e.target.value as QuestionType;
                      update(i, {
                        type,
                        options: NEEDS_OPTIONS.includes(type) ? (q.options?.length ? q.options : ["Option 1", "Option 2"]) : undefined,
                      });
                    }}
                  >
                    {QUESTION_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {QUESTION_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                  <div className="flex gap-1">
                    <button type="button" className={btnSm} aria-label="Move up" onClick={() => move(i, -1)}>↑</button>
                    <button type="button" className={btnSm} aria-label="Move down" onClick={() => move(i, 1)}>↓</button>
                    <button type="button" className={btnSm} aria-label="Remove question" onClick={() => remove(i)}>×</button>
                  </div>
                </div>
                {!linked && <p className="mt-2 text-xs text-bad-ink">Not linked to a field yet. Choose one above.</p>}
                {NEEDS_OPTIONS.includes(q.type) && (
                  <label className={`${label} mt-2`}>
                    Options (one per line)
                    <textarea
                      className={`${input} min-h-[70px]`}
                      value={(q.options ?? []).join("\n")}
                      onChange={(e) => update(i, { options: e.target.value.split("\n") })}
                    />
                  </label>
                )}
                <label className="mt-2 flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={q.required} onChange={(e) => update(i, { required: e.target.checked })} />
                  Required
                </label>

                {creatingFor === i && (
                  <NewFieldPanel
                    domain={kind === "intake" ? "registration" : "feedback"}
                    pillar={pillar}
                    canCreateGlobal={canCreateGlobal}
                    onCreated={(f) => {
                      setFieldList((prev) => [...prev, f]);
                      update(i, {
                        id: f.key,
                        label: q.label.trim() ? q.label : f.label,
                        type: f.type,
                        options: NEEDS_OPTIONS.includes(f.type) ? f.options : undefined,
                      });
                      setCreatingFor(null);
                    }}
                    onCancel={() => setCreatingFor(null)}
                  />
                )}
              </li>
            );
          })}
        </ol>
        <button type="button" className={`${btn} mt-3`} onClick={add}>
          + Add question
        </button>
      </section>

      {error && (
        <p role="alert" className="rounded-md bg-bad-soft p-3 text-sm text-bad-ink">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2 border-t border-line pt-4">
        <button type="button" className={btn} onClick={onClose}>
          Cancel
        </button>
        <button type="button" className={btnPri} onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save form"}
        </button>
      </div>
    </div>
  );
}

// Creates a field in the dictionary, then the editor links the question to it.
function NewFieldPanel({
  domain,
  pillar,
  canCreateGlobal,
  onCreated,
  onCancel,
}: {
  domain: "registration" | "feedback";
  pillar: string;
  canCreateGlobal: boolean;
  onCreated: (f: FieldOption) => void;
  onCancel: () => void;
}) {
  const [key, setKey] = useState("");
  const [text, setText] = useState("");
  const [type, setType] = useState<QuestionType>("text");
  const [options, setOptions] = useState("");
  const [shared, setShared] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Suggest a key from the label until the staff member types one.
  const suggestKey = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^[^a-z]+/, "");

  const create = async () => {
    setError(null);
    const list = NEEDS_OPTIONS.includes(type) ? options.split("\n").map((o) => o.trim()).filter(Boolean) : [];
    setSaving(true);
    const result = await createField({ key, label: text, type, options: list, domain, pillar: shared ? null : pillar });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onCreated({ key: result.data.key, label: text.trim(), type, options: list, scope: shared ? "global" : "pillar", pillar: shared ? null : pillar });
  };

  return (
    <div className="mt-3 flex flex-col gap-2 rounded-md bg-sunk p-3">
      <p className="text-sm font-semibold">New field</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className={label}>
          Label
          <input
            className={input}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (!key) setKey(suggestKey(e.target.value));
            }}
          />
        </label>
        <label className={label}>
          Key (used in exports)
          <input className={input} value={key} onChange={(e) => setKey(e.target.value)} />
        </label>
        <label className={label}>
          Answer type
          <select className={input} value={type} onChange={(e) => setType(e.target.value as QuestionType)}>
            {FIELD_TYPES.map((t) => (
              <option key={t} value={t}>
                {QUESTION_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        {canCreateGlobal && (
          <label className="flex items-center gap-2 self-end text-sm">
            <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
            Shared across all pillars
          </label>
        )}
      </div>
      {NEEDS_OPTIONS.includes(type) && (
        <label className={label}>
          Options (one per line)
          <textarea className={`${input} min-h-[60px]`} value={options} onChange={(e) => setOptions(e.target.value)} />
        </label>
      )}
      {error && (
        <p role="alert" className="text-sm text-bad-ink">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" className={btn} onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className={btnPri} onClick={create} disabled={saving}>
          {saving ? "Creating…" : "Create field"}
        </button>
      </div>
    </div>
  );
}
