import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { toCsv } from "@/lib/csv";
import { EXPORTS, EXPORT_TABLES, type ExportTable } from "@/lib/export/tables";
import { todayIso } from "@/lib/dates";
import { logExport } from "@/lib/export/log";

export const runtime = "nodejs";

// Admin only (SPEC §8). Participant data is personal, so every export is restricted.
export async function GET(_request: Request, { params }: { params: Promise<{ table: string }> }) {
  const { table } = await params;
  if (!(EXPORT_TABLES as readonly string[]).includes(table)) {
    return NextResponse.json({ error: "Unknown table" }, { status: 404 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  const { data: staff } = await supabase.from("staff_roles").select("role").eq("user_id", user.id).maybeSingle();
  if (staff?.role !== "admin") return NextResponse.json({ error: "Only admins can export data" }, { status: 403 });

  try {
    const def = EXPORTS[table as ExportTable];
    const rows = await def.load(supabase);
    const csv = toCsv(def.columns, rows);
    // Admin only, so every column is included. Recorded in the export log.
    await logExport(supabase, {
      exportKind: "table",
      pillar: null,
      detail: table,
      filters: {},
      rowCount: rows.length,
      includesRestricted: true,
      fileName: `mela-${table}-${todayIso()}.csv`,
    });
    return new NextResponse(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="mela-${table}-${todayIso()}.csv"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    console.error("export failed", table, e);
    return NextResponse.json({ error: "The export could not be completed." }, { status: 500 });
  }
}
