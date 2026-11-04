import { z } from "zod";
import type { Question, QuestionType } from "./questions";
import { INTAKE_CORE, FEEDBACK_CORE } from "./core-questions";

// One shape for standard and custom questions, used by the public form, the staff preview and the API.
export type FieldType = QuestionType | "consent";
export type FieldSpec = {
  id: string;
  label: string;
  type: FieldType;
  required: boolean;
  options?: string[];
  // Shown only when the answer to question `id` is one of `equals`. Hidden fields are not asked or saved.
  showWhen?: { id: string; equals: string[] };
  // For email fields: the address must be on one of these domains (or a subdomain of one).
  emailDomains?: string[];
};

export type PublicFormKind = "intake" | "attendance" | "feedback" | "employer_feedback";

const fromQuestion = (q: Question): FieldSpec => ({
  id: q.id,
  label: q.label,
  type: q.type,
  required: q.required,
  options: q.options,
  showWhen: q.showWhen,
});

// Fields for each public form (SPEC §5). Attendance asks for an email and a session date.
export function publicFields(kind: PublicFormKind, questions: Question[], sessionDates: string[]): FieldSpec[] {
  if (kind === "attendance") {
    return [
      { id: "email", label: "Email you registered with", type: "email", required: true },
      {
        id: "day",
        label: "Which session date are you checking in for?",
        type: "single",
        required: true,
        options: sessionDates,
      },
    ];
  }
  const core = kind === "intake" ? INTAKE_CORE : FEEDBACK_CORE;
  return [...core, ...questions.map(fromQuestion)];
}

// Whether a field is asked, given the answers so far.
export function isVisible(field: FieldSpec, values: Record<string, unknown>): boolean {
  if (!field.showWhen) return true;
  const answer = values[field.showWhen.id];
  return typeof answer === "string" && field.showWhen.equals.includes(answer);
}

export function visibleFields(fields: FieldSpec[], values: Record<string, unknown>): FieldSpec[] {
  return fields.filter((f) => isVisible(f, values));
}

// Checks the answers against only the questions that are showing. Answers to hidden questions are dropped.
export function validateAnswers(fields: FieldSpec[], values: Record<string, unknown>) {
  return buildValuesSchema(visibleFields(fields, values)).safeParse(values);
}

// Whether an address is on a domain: "example.org" matches "a@example.org" and "a@mail.example.org".
export function isOnDomain(address: string, domain: string) {
  const host = address.toLowerCase().split("@").pop() ?? "";
  const d = domain.toLowerCase();
  return host === d || host.endsWith(`.${d}`);
}

const isEmpty = (v: unknown) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);

// Builds a zod schema for the whole form. Required questions reject empty values with a plain message.
export function buildValuesSchema(fields: FieldSpec[]) {
  const shape: Record<string, z.ZodType> = {};
  for (const f of fields) shape[f.id] = fieldSchema(f);
  return z.object(shape);
}

function fieldSchema(f: FieldSpec): z.ZodType {
  const requiredMsg = f.type === "consent" ? "Consent is needed to continue." : "This question is required.";
  let base: z.ZodType;
  switch (f.type) {
    case "consent":
      base = z.literal("yes", { message: requiredMsg });
      break;
    case "email":
      base = z
        .string({ message: requiredMsg })
        .trim()
        .min(f.required ? 1 : 0, requiredMsg)
        .email("Enter a valid email address.")
        .max(254)
        .refine((v) => !f.emailDomains || f.emailDomains.some((d) => isOnDomain(v, d)), {
          message: `Use your ${(f.emailDomains ?? [""])[0]} email address.`,
        });
      break;
    case "number":
      base = z.number({ message: "Enter a number." });
      break;
    case "rating":
      base = z.number({ message: requiredMsg }).int().min(1).max(5);
      break;
    case "scale10":
      base = z.number({ message: requiredMsg }).int().min(0).max(10);
      break;
    case "single":
    case "yesno": {
      const opts = f.type === "yesno" ? ["Yes", "No"] : (f.options ?? []);
      base = z.enum(opts as [string, ...string[]], { message: "Choose one of the options." });
      break;
    }
    case "multi":
      base = z.array(z.enum((f.options ?? []) as [string, ...string[]])).min(1, { message: requiredMsg });
      break;
    case "long":
      base = z.string({ message: requiredMsg }).trim().min(f.required ? 1 : 0, requiredMsg).max(4000);
      break;
    default:
      base = z.string({ message: requiredMsg }).trim().min(f.required ? 1 : 0, requiredMsg).max(500);
  }
  // Empty optional answers are dropped; empty required answers fail with requiredMsg.
  return z.preprocess((v) => (isEmpty(v) ? undefined : v), f.required ? base : base.optional());
}
