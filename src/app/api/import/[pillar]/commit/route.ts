import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { planImport } from "@/lib/import/plan";
import { PERSON_TARGETS, readSheet } from "@/lib/import/sheet";

export const runtime = "nodejs";

const PILLARS = ["HENT", "HEMP", "HECO"] as const;

// Person field names as the registration rules read them.
const REGISTRATION_NAMES: Record<string, string> = {
  residence_country: "country_of_residence",
  humanitarian_status: "humanitarian",
  disability_status: "disability",
  academic_programme: "programme",
};
const PERSON_KEYS = new Set(PERSON_TARGETS.map((t) => t.key));

// Writes the rows of a sheet into a cohort, after a dry run. Each row is either imported, already on record, or
// refused with the reason. Registrations need recorded consent. Feedback is matched by email.
export async function POST(request: NextRequest, { params }: { params: Promise<{ pillar: string }> }) {
  const { pillar: raw } = await params;
  const pillar = raw.toUpperCase();
  if (!(PILLARS as readonly string[]).includes(pillar)) return NextResponse.json({ error: "Unknown pillar" }, { status: 404 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const { data: staff } = await supabase.from("staff_roles").select("role, pillars").eq("user_id", user.id).maybeSingle();
  if (!staff || (staff.role !== "admin" && !(staff.pillars ?? []).includes(pillar))) {
    return NextResponse.json({ error: "You do not have access to this pillar" }, { status: 403 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a CSV or XLSX file" }, { status: 400 });
  if (file.size > 5_000_000) return NextResponse.json({ error: "That file is too large (5 MB at most)." }, { status: 413 });

  const kind = form.get("kind") === "feedback" ? "feedback" : "participants";
  const interventionId = String(form.get("interventionId") ?? "");
  const cohortId = String(form.get("cohortId") ?? "");
  const { data: cohort } = await supabase.from("cohort").select("id, intervention_id").eq("id", cohortId).maybeSingle();
  if (!cohort || cohort.intervention_id !== interventionId) {
    return NextResponse.json({ error: "Choose a cohort of this intervention" }, { status: 400 });
  }
  const { data: iv } = await supabase.from("interventions").select("id, pillar").eq("id", interventionId).maybeSingle();
  if (!iv || iv.pillar !== pillar) return NextResponse.json({ error: "Choose an intervention of this pillar" }, { status: 400 });

  let mapping: Record<string, string>;
  try {
    mapping = JSON.parse(String(form.get("mapping") ?? "{}")) as Record<string, string>;
  } catch {
    return NextResponse.json({ error: "The column mapping could not be read" }, { status: 400 });
  }

  const sheet = await readSheet(file);
  if (sheet.length < 2) return NextResponse.json({ error: "The sheet needs a header row and at least one row" }, { status: 400 });
  const [headers, ...rows] = sheet.map((r) => r.map((c) => c.trim()));
  const plan = planImport(headers, rows, mapping);

  let imported = 0;
  let already = 0;
  const refused: { row: number; reason: string }[] = plan.invalid.map((i) => ({ row: i.row, reason: i.message }));
  let stopped: string | null = null;

  // Rows are read from the plan; their sheet row numbers come from the plan's own order of valid rows.
  const sheetRows = rows.map((_, i) => i + 2);
  let validIndex = 0;
  for (let i = 0; i < rows.length && !stopped; i++) {
    if (plan.invalid.some((x) => x.row === sheetRows[i])) continue;
    const row = plan.rows[validIndex++];
    const number = sheetRows[i];
    // Everything that is not a person field is a registration or feedback answer.
    const answers = Object.fromEntries(Object.entries(row).filter(([k, v]) => !PERSON_KEYS.has(k) && v !== null));

    if (kind === "participants") {
      if (String(row.consent ?? "").toLowerCase() !== "yes") {
        refused.push({ row: number, reason: "No consent recorded" });
        continue;
      }
      const profile: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) {
        if (v === null || k === "consent") continue;
        profile[REGISTRATION_NAMES[k] ?? k] = v;
      }
      profile.consent = "yes";
      const { error } = await supabase.rpc("import_registration", {
        p_cohort: cohortId,
        p_profile: profile,
        p_answers: answers,
      });
      if (!error) imported++;
      else if (error.code === "23505") already++;
      else if (error.code === "42501") stopped = error.message;
      else refused.push({ row: number, reason: error.message });
    } else {
      const { error } = await supabase.rpc("import_feedback", {
        p_cohort: cohortId,
        p_email: row.email ?? "",
        p_name: row.full_name ?? "",
        p_answers: Object.fromEntries(Object.entries(row).filter(([k, v]) => v !== null && !["email", "full_name", "student_email"].includes(k))),
      });
      if (!error) imported++;
      else if (error.code === "23505") already++;
      else if (error.code === "42501") stopped = error.message;
      else refused.push({ row: number, reason: error.message });
    }
  }

  if (stopped) return NextResponse.json({ error: stopped }, { status: 403 });

  const summary = { rows: plan.total, imported, already, refused: refused.slice(0, 200), refusedCount: refused.length };

  // Keep the mapping for the next import of this layout, and record the batch.
  await supabase.from("import_mapping").upsert(
    Object.entries(mapping).map(([sheet_header, target]) => ({
      intervention_id: interventionId,
      sheet_header,
      target,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "intervention_id,sheet_header" },
  );
  await supabase.from("import_batch").insert({
    intervention_id: interventionId,
    kind,
    status: "imported",
    file_name: file.name,
    summary,
    created_by: user.id,
  });

  return NextResponse.json({ ok: true, data: summary });
}
