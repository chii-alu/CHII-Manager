// Standard (locked) questions, always rendered first (SPEC §5). Wording and options from the prototype.
import type { FieldSpec } from "./fields";

export const INTAKE_CORE: FieldSpec[] = [
  { id: "name", label: "Full name", type: "text", required: true },
  { id: "email", label: "Email address", type: "email", required: true },
  { id: "phone", label: "Phone number", type: "text", required: true },
  { id: "gender", label: "Gender", type: "single", required: true, options: ["Female", "Male", "Other", "Prefer not to say"] },
  { id: "age", label: "Age group", type: "single", required: true, options: ["Under 18", "18–24", "25–34", "35–44", "45+"] },
  { id: "country", label: "Country of residence", type: "text", required: true },
  {
    id: "affiliation",
    label: "Current affiliation",
    type: "single",
    required: true,
    options: ["Student", "Alumni", "Founder / entrepreneur", "Professional", "Public servant", "Other"],
  },
  {
    id: "disability",
    label: "Do you identify as a person with a disability?",
    type: "single",
    required: true,
    options: ["Yes", "No", "Prefer not to say"],
  },
  {
    id: "consent",
    label: "I consent to my information being used to run this programme and for monitoring, evaluation and learning.",
    type: "consent",
    required: true,
  },
];

export const FEEDBACK_CORE: FieldSpec[] = [
  { id: "email", label: "Email you registered with", type: "email", required: true },
  {
    id: "consent",
    label: "I consent to my information being used to run this programme and for monitoring, evaluation and learning.",
    type: "consent",
    required: true,
  },
  { id: "sat", label: "Overall, how satisfied are you with this session?", type: "rating", required: true },
  { id: "rel", label: "How relevant was the content to your goals?", type: "rating", required: true },
  { id: "nps", label: "How likely are you to recommend this to a friend or colleague?", type: "scale10", required: true },
  { id: "learn", label: "What is the most useful thing you took away?", type: "long", required: false },
  { id: "improve", label: "What should we improve next time?", type: "long", required: false },
];
