import type { createClient } from "@/lib/supabase/server";
import { todayIso } from "@/lib/dates";
import type { SheetSpec } from "@/lib/export/xlsx";
import { FEEDBACK_COLUMNS, PARTICIPANT_COLUMNS } from "@/lib/workbooks/columns";
import { answerText, buildExtras, type ExtraAnswer, type Extras } from "@/lib/workbooks/extras";
import { allowedColumns, RESTRICTED_COLUMNS } from "@/lib/export/restricted";

export type ConsolidatedType = "participants" | "feedback";
export type Supabase = Awaited<ReturnType<typeof createClient>>;

// Questions the fixed feedback columns already show. Anything else answered is an extra column.
const FEEDBACK_FIXED = new Set(["relevance", "quality", "usefulness", "confidence", "next_action", "support_needed", "nps", "most_valuable", "improvements", "email", "name", "consent"]);
// Person details are fixed columns too; answers to registration questions (application answers) become extras.
const PARTICIPANT_FIXED = new Set(["email", "full_name", "phone", "student_id", "gender", "consent", "institution", "student_email", "residence", "nationality", "humanitarian", "disability", "enrolment_status", "programme", "country_of_residence", "whatsapp"]);

// The sheets of one pillar's consolidated database: "All interventions", a sheet per intervention, and a README.
// Used by the download route and by the database pages, so both show the same records and columns.
// Throws if the records cannot be read.
export async function buildConsolidated(supabase: Supabase, pillar: string, type: ConsolidatedType, canSeeRestricted: boolean) {
  const isParticipants = type === "participants";
  const view = isParticipants ? "v_workbook_participants" : "v_workbook_feedback";
  const keys: [string | null, string][] = isParticipants ? PARTICIPANT_COLUMNS : FEEDBACK_COLUMNS;
  // Spec columns with no matching question get their own empty column, keyed by position.
  const base = allowedColumns(
    keys.map(([k], i) => k ?? `blank_${i}`),
    keys.map(([, h]) => h),
    canSeeRestricted,
  );
  const columns = base.keys;
  const headers = base.headers;
  let removedAny = base.removed;

  const { data, error } = await supabase.from(view).select("*").eq("pillar", pillar).limit(50000);
  if (error) throw new Error(`Could not read ${view}: ${error.message}`);
  const rows = (data ?? []) as Record<string, unknown>[];

  // Interventions of this pillar, in catalogue order, and the field labels for extra columns.
  const { data: ivs } = await supabase.from("interventions").select("id, name").eq("pillar", pillar).order("created_at").order("name");
  const interventions = (ivs ?? []) as { id: string; name: string }[];
  const interventionNames = interventions.map((i) => i.name);
  const { data: fieldRows } = await supabase.from("field").select("field_key, label");
  const labelFor = new Map((fieldRows ?? []).map((f) => [f.field_key as string, f.label as string]));

  // Extra answers: each row's key is what it is matched by (the feedback id, or the person and intervention).
  let extras: Extras;
  let keyOf: (r: Record<string, unknown>) => string;
  if (isParticipants) {
    const { data: apps } = await supabase.from("application").select("id, chii_id, cohort_id");
    const { data: cohorts } = await supabase.from("cohort").select("id, intervention_id");
    const ivName = new Map(interventions.map((i) => [i.id, i.name]));
    const cohortIv = new Map((cohorts ?? []).map((c) => [c.id as string, c.intervention_id as string]));
    const appKey = new Map((apps ?? []).map((a) => [a.id as string, `${a.chii_id}|${ivName.get(cohortIv.get(a.cohort_id as string) ?? "") ?? ""}`]));
    const { data: values } = await supabase.from("response_value").select("response_id, field_key, value_text, value_number, value_json").eq("response_type", "application");
    const answers: ExtraAnswer[] = (values ?? [])
      .filter((v) => appKey.has(v.response_id as string))
      .map((v) => ({ responseId: appKey.get(v.response_id as string)!, fieldKey: v.field_key as string, value: answerText(v as never) }));
    extras = buildExtras(answers, PARTICIPANT_FIXED, labelFor);
    keyOf = (r) => `${r.chii_id}|${r.intervention}`;
  } else {
    const { data: values } = await supabase.from("response_value").select("response_id, field_key, value_text, value_number, value_json").eq("response_type", "feedback");
    const answers: ExtraAnswer[] = (values ?? []).map((v) => ({ responseId: v.response_id as string, fieldKey: v.field_key as string, value: answerText(v as never) }));
    extras = buildExtras(answers, FEEDBACK_FIXED, labelFor);
    keyOf = (r) => String(r.feedback_id);
  }

  // A sheet's extra columns: the ones its rows use, in first-used order.
  const extrasFor = (subset: Record<string, unknown>[]) => extras.keys.filter((k) => subset.some((r) => extras.byResponse.get(keyOf(r))?.[k] !== undefined));

  const spec = (name: string, subset: Record<string, unknown>[], withIntervention: boolean): SheetSpec => {
    const extraKeys = extrasFor(subset).filter((k) => {
      const allowed = canSeeRestricted || !RESTRICTED_COLUMNS.has(k.replace(/^extra_/, ""));
      if (!allowed) removedAny = true;
      return allowed;
    });
    return {
      name,
      columns: [...(withIntervention ? ["intervention"] : []), ...columns, ...extraKeys],
      headers: [...(withIntervention ? ["Intervention"] : []), ...headers, ...extraKeys.map((k) => extras.labels.get(k) ?? k)],
      rows: subset.map((r) => ({ ...r, ...(extras.byResponse.get(keyOf(r)) ?? {}) })),
    };
  };

  const readme: SheetSpec = {
    name: "README",
    columns: ["item", "detail"],
    headers: ["Item", "Detail"],
    rows: [
      { item: "Pillar", detail: pillar },
      { item: "Workbook", detail: isParticipants ? "Participants: one row per person per intervention" : "Feedback: one row per response" },
      { item: "Generated", detail: todayIso() },
      { item: "Interventions", detail: interventionNames.join("; ") || "None yet" },
      { item: "Interventions and times supported", detail: "Count across every pillar, as the spec sets" },
      { item: "Empty columns", detail: "Columns with no matching question yet stay empty" },
      { item: "Extra columns", detail: "Questions answered on forms that the fixed columns do not cover, added after them" },
    ],
  };

  const sheets: SheetSpec[] = [
    spec("All interventions", rows, true),
    ...interventionNames.map((name) => spec(name, rows.filter((r) => r.intervention === name), false)),
    readme,
  ];
  return { sheets, recordCount: rows.length, removedAny };
}
