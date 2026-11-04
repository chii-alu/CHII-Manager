import { NextResponse, type NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { parseCsv } from "@/lib/import/csv";
import { planImport, suggestMapping, type Target } from "@/lib/import/plan";

export const runtime = "nodejs";

const PILLARS = ["HENT", "HEMP", "HECO"] as const;

// The person fields a sheet can be mapped to (the core profile, and the answers that go with it).
const PERSON_TARGETS: Target[] = [
  { key: "email", label: "Email", aliases: ["Email address", "Personal email address"] },
  { key: "student_email", label: "Student email", aliases: ["Student email address"] },
  { key: "full_name", label: "Names", aliases: ["Full name", "Name"] },
  { key: "phone", label: "Phone", aliases: ["Phone number", "WhatsApp"] },
  { key: "gender", label: "Gender" },
  { key: "gender_identity", label: "Gender Identity" },
  { key: "nationality", label: "Nationality" },
  { key: "birth_country", label: "Country of Birth", aliases: ["Birth country"] },
  { key: "residence_country", label: "Country of Residence", aliases: ["Country of residence"] },
  { key: "residence_city", label: "City of Residence", aliases: ["City"] },
  { key: "student_id", label: "Student ID" },
  { key: "humanitarian_status", label: "Has Humanitarian Status" },
  { key: "disability_status", label: "Disability Status", aliases: ["Disability"] },
  { key: "enrolment_status", label: "Enrollment Status", aliases: ["Enrolment status"] },
  { key: "year_group", label: "Year Group" },
  { key: "academic_programme", label: "Primary Academic Program", aliases: ["Programme", "Program"] },
];

async function readSheet(file: File): Promise<string[][]> {
  const buffer = Buffer.from(await file.arrayBuffer());
  if (file.name.toLowerCase().endsWith(".xlsx")) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as never);
    const sheet = wb.worksheets[0];
    const rows: string[][] = [];
    sheet?.eachRow({ includeEmpty: false }, (row) => {
      const cells: string[] = [];
      for (let c = 1; c <= row.cellCount; c++) cells.push(row.getCell(c).text ?? "");
      rows.push(cells);
    });
    return rows;
  }
  return parseCsv(buffer.toString("utf8"));
}

// Dry run: reads the sheet, matches its columns, checks every row and says what a commit would do. Writes nothing.
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
  const { data: iv } = await supabase.from("interventions").select("id, pillar").eq("id", interventionId).maybeSingle();
  if (!iv || iv.pillar !== pillar) return NextResponse.json({ error: "Choose an intervention of this pillar" }, { status: 400 });

  const sheet = await readSheet(file);
  if (sheet.length < 2) return NextResponse.json({ error: "The sheet needs a header row and at least one row" }, { status: 400 });
  const [headers, ...rows] = sheet.map((r) => r.map((c) => c.trim()));

  // Fields a sheet can map to: the person fields, plus the field dictionary for this kind of form.
  const domains = kind === "feedback" ? ["feedback"] : ["registration", "profile"];
  const { data: fieldRows } = await supabase.from("field").select("field_key, label").in("domain", domains).eq("archived", false);
  const targets: Target[] = [
    ...PERSON_TARGETS,
    ...(fieldRows ?? []).map((f) => ({ key: f.field_key as string, label: f.label as string })),
  ];

  let mapping: Record<string, string>;
  try {
    const sent = form.get("mapping");
    mapping = typeof sent === "string" && sent ? (JSON.parse(sent) as Record<string, string>) : suggestMapping(headers, targets);
  } catch {
    return NextResponse.json({ error: "The column mapping could not be read" }, { status: 400 });
  }

  const plan = planImport(headers, rows, mapping);
  const { data: counts } = await supabase.rpc("import_match_counts", { p_emails: plan.rows.map((r) => r.email ?? "") });
  const c = (counts ?? { matched: 0, new: 0 }) as { matched: number; new: number };

  return NextResponse.json({
    ok: true,
    data: {
      kind,
      total: plan.total,
      valid: plan.valid,
      duplicates: plan.duplicates,
      matched: c.matched,
      new: c.new,
      invalid: plan.invalid.slice(0, 100),
      mapping,
      headers,
      targets: targets.map((t) => ({ key: t.key, label: t.label })),
      unmappedHeaders: plan.unmappedHeaders,
      sample: plan.rows.slice(0, 5),
    },
  });
}
