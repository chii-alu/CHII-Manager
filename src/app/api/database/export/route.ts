import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { todayIso } from "@/lib/dates";
import { toCsv } from "@/lib/csv";
import { toWorkbook } from "@/lib/export/xlsx";
import { toPdf } from "@/lib/export/pdf";
import { fileName, RESTRICTED_COLUMNS } from "@/lib/export/restricted";
import { logExport } from "@/lib/export/log";
import { cellText } from "@/lib/database/table";

export const runtime = "nodejs";

const PILLARS = ["HENT", "HEMP", "HECO"] as const;

// What the database page sends: the sheet as it is on screen (after filters and sorting, or the whole sheet).
const Body = z.object({
  pillar: z.enum(PILLARS),
  type: z.enum(["participants", "feedback"]),
  sheet: z.string().min(1).max(120),
  format: z.enum(["xlsx", "csv", "pdf"]),
  scope: z.enum(["filtered", "all"]),
  columns: z.array(z.string().min(1).max(120)).min(1).max(300),
  headers: z.array(z.string().max(200)).min(1).max(300),
  rows: z.array(z.record(z.string(), z.unknown())).max(50000),
  filters: z.record(z.string().max(120), z.string().max(500).nullable()).optional(),
});

const TYPE_LABEL = { participants: "Participants", feedback: "Feedback" } as const;

export async function POST(request: NextRequest) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "The export request is not valid." }, { status: 400 });
  const body = parsed.data;
  if (body.columns.length !== body.headers.length) return NextResponse.json({ error: "Columns and headings do not match." }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const { data: staff } = await supabase.from("staff_roles").select("role, pillars").eq("user_id", user.id).maybeSingle();
  if (!staff) return NextResponse.json({ error: "Only MELA staff can export" }, { status: 403 });
  // Pillar staff export only their own pillar. Admins export any.
  const isAdmin = staff.role === "admin";
  if (!isAdmin && !(staff.pillars as string[] | null)?.includes(body.pillar)) {
    return NextResponse.json({ error: "You can only export your own pillar" }, { status: 403 });
  }

  // Restricted columns are removed for everyone except the data owner, whatever the page sent.
  let removedAny = false;
  const keep = body.columns.map((c, i) => ({ c, h: body.headers[i], allowed: isAdmin || !RESTRICTED_COLUMNS.has(c.replace(/^extra_/, "")) }));
  if (keep.some((k) => !k.allowed)) removedAny = true;
  const kept = keep.filter((k) => k.allowed);
  const columns = kept.map((k) => k.c);
  const headers = kept.map((k) => k.h);
  const rows = body.rows.map((r) => Object.fromEntries(columns.map((c) => [c, r[c] ?? null])));

  const typeLabel = TYPE_LABEL[body.type];
  const scopeLabel = body.scope === "filtered" ? " (filtered)" : "";
  const base = `${body.pillar} Consolidated ${typeLabel} - ${body.sheet.replace(/[\\/:*?"<>|]/g, " ").trim()}${scopeLabel}`;
  const name = fileName(base, body.format, removedAny);
  const title = `${body.pillar} Consolidated ${typeLabel}`;
  const subtitle = `${body.sheet}${scopeLabel} · ${rows.length} records · exported ${todayIso()}`;

  let bytes: Uint8Array;
  let contentType: string;
  if (body.format === "xlsx") {
    bytes = new Uint8Array(await toWorkbook([{ name: body.sheet, columns, headers, rows }]));
    contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  } else if (body.format === "csv") {
    // The CSV header row is the on-screen headings; values are looked up by column key.
    const byHeading = rows.map((r) => Object.fromEntries(columns.map((c, i) => [headers[i], r[c]])));
    bytes = new TextEncoder().encode(toCsv(headers, byHeading));
    contentType = "text/csv; charset=utf-8";
  } else {
    bytes = await toPdf({ title, subtitle, columns, headers, rows });
    contentType = "application/pdf";
  }

  await logExport(supabase, {
    exportKind: "workbook",
    pillar: body.pillar,
    detail: `${body.type}:${body.sheet}:${body.format}:${body.scope}`,
    filters: Object.fromEntries(Object.entries(body.filters ?? {}).map(([k, v]) => [k, v === null ? null : cellText(v)])),
    rowCount: rows.length,
    includesRestricted: columns.some((c) => RESTRICTED_COLUMNS.has(c.replace(/^extra_/, ""))),
    fileName: name,
  });

  return new NextResponse(bytes as BodyInit, {
    headers: {
      "content-type": contentType,
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "no-store",
    },
  });
}
