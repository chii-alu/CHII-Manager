"use client";

import { useState, type ReactNode } from "react";
import { useForm, type FieldPath } from "react-hook-form";
import { MODES, sessionInputSchema, type SessionInput } from "@/lib/sessions/schema";
import type { ActionResult } from "@/app/manage/actions";
import { btn, btnPri, fieldError, input, label } from "@/components/ui/styles";

type FormValues = {
  title: string;
  datesText: string;
  mode: (typeof MODES)[number];
  capacity: string;
  venue: string;
  facilitator: string;
  deadline: string;
};

export type SessionDefaults = Partial<{
  title: string;
  dates: string[];
  mode: (typeof MODES)[number];
  capacity: number | null;
  venue: string | null;
  facilitator: string | null;
  applicationDeadline: string | null;
}>;

// Dates are typed as a comma-separated list (SPEC §7; prototype wording).
const parseDates = (text: string) => text.split(/[,\s]+/).filter(Boolean);

// Map zod issue paths to the form field that shows the message.
const FIELD_FOR_PATH: Record<string, FieldPath<FormValues>> = {
  title: "title",
  dates: "datesText",
  capacity: "capacity",
  applicationDeadline: "deadline",
};

export function SessionForm({
  selective,
  defaults,
  submitLabel,
  onSubmit,
  onCancel,
  extraFields,
  deleteSlot,
}: {
  selective: boolean;
  defaults?: SessionDefaults;
  submitLabel: string;
  onSubmit: (input: SessionInput) => Promise<ActionResult>;
  onCancel?: () => void;
  extraFields?: ReactNode;
  deleteSlot?: ReactNode;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: {
      title: defaults?.title ?? "",
      datesText: (defaults?.dates ?? []).join(", "),
      mode: defaults?.mode ?? "In person",
      capacity: defaults?.capacity == null ? "" : String(defaults.capacity),
      venue: defaults?.venue ?? "",
      facilitator: defaults?.facilitator ?? "",
      deadline: defaults?.applicationDeadline ?? "",
    },
  });

  const submit = handleSubmit(async (v) => {
    setServerError(null);
    setSaved(false);
    const parsed = sessionInputSchema.safeParse({
      title: v.title,
      dates: parseDates(v.datesText),
      mode: v.mode,
      capacity: v.capacity.trim() === "" ? null : Number(v.capacity),
      venue: v.venue,
      facilitator: v.facilitator,
      applicationDeadline: selective && v.deadline ? v.deadline : null,
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = FIELD_FOR_PATH[String(issue.path[0])];
        if (field) setError(field, { message: issue.message });
        else setServerError(issue.message);
      }
      return;
    }
    const result = await onSubmit(parsed.data);
    if (!result.ok) setServerError(result.error);
    else setSaved(true);
  });

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <label className={label}>
        Session title <span className="text-bad-ink">*</span>
        <input className={input} {...register("title")} />
        {errors.title && <span className={fieldError}>{errors.title.message}</span>}
      </label>

      <label className={label}>
        Session dates <span className="text-bad-ink">*</span>
        <input className={input} placeholder="2026-11-12, 2026-11-19" {...register("datesText")} />
        <span className="text-sm font-normal text-muted">
          One date for a single event. Several dates (comma separated) for multi-day events or session meetings. Attendance is taken for each.
        </span>
        {errors.datesText && <span className={fieldError}>{errors.datesText.message}</span>}
      </label>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className={label}>
          Delivery
          <select className={input} {...register("mode")}>
            {MODES.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        <label className={label}>
          Capacity
          <input className={input} type="number" min={0} {...register("capacity")} />
          {errors.capacity && <span className={fieldError}>{errors.capacity.message}</span>}
        </label>
        {selective && (
          <label className={label}>
            Application deadline
            <input className={input} type="date" {...register("deadline")} />
            {errors.deadline && <span className={fieldError}>{errors.deadline.message}</span>}
          </label>
        )}
      </div>

      <label className={label}>
        Venue or link
        <input className={input} {...register("venue")} />
      </label>

      <label className={label}>
        Facilitator / owner
        <input className={input} {...register("facilitator")} />
      </label>

      {extraFields}

      {serverError && (
        <p role="alert" className="rounded-md bg-bad-soft p-3 text-sm text-bad-ink">
          {serverError}
        </p>
      )}
      {saved && <p role="status" className="rounded-md bg-ok-soft p-3 text-sm text-ok-ink">Saved.</p>}

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
        {deleteSlot}
        {onCancel && (
          <button type="button" className={btn} onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className={btnPri} disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
