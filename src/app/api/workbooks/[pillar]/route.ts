import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { toWorkbook } from "@/lib/export/xlsx";
import { fileName } from "@/lib/export/restricted";
import { logExport } from "@/lib/export/log";
import { buildConsolidated } from "@/lib/workbooks/consolidated";

export const runtime = "nodejs";

const PILLARS = ["HENT", "HEMP", "HECO"] as const;

// Consolidated workbook for one pillar: a sheet per intervention, an "All interventions" sheet, and a README.
export async function GET(request: NextRequest, { params }: { params: Promise<{ pillar: string }> }) {
  const { pillar: raw } = await params;
  const pillar = raw.toUpperCase();
  if (!(PILLARS as readonly string[]).includes(pillar)) return NextResponse.json({ error: "Unknown pillar" }, { status: 404 });

  const type = request.nextUrl.searchParams.get("type");
  if (type !== "participants" && type !== "feedback") return NextResponse.json({ error: "Use type=participants or type=feedback" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const { data: staff } = await supabase.from("staff_roles").select("role").eq("user_id", user.id).maybeSingle();
  if (!staff) return NextResponse.json({ error: "Only MELA staff can export workbooks" }, { status: 403 });

  const canSeeRestricted = staff.role === "admin";
  let built;
  try {
    built = await buildConsolidated(supabase, pillar, type, canSeeRestricted);
  } catch (e) {
    console.error("workbook export failed", e);
    return NextResponse.json({ error: "The workbook could not be generated." }, { status: 500 });
  }

  const xlsx = await toWorkbook(built.sheets);

  const name = `${pillar} Consolidated ${type === "participants" ? "Participants" : "Feedback"}`;
  await logExport(supabase, {
    exportKind: "workbook",
    pillar,
    detail: type,
    filters: {},
    rowCount: built.recordCount,
    includesRestricted: canSeeRestricted,
    fileName: fileName(name, "xlsx", built.removedAny),
  });

  return new NextResponse(new Uint8Array(xlsx), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${fileName(name, "xlsx", built.removedAny)}"`,
      "cache-control": "no-store",
    },
  });
}
