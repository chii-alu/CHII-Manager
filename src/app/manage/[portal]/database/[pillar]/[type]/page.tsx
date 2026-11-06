import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isPortal, pillarsForPortal } from "@/lib/auth/portals";
import { buildConsolidated } from "@/lib/workbooks/consolidated";
import { PageBand } from "@/components/ui/page-band";
import { ConsolidatedTable } from "@/components/manage/ConsolidatedTable";

const PILLARS = ["HENT", "HEMP", "HECO"];
const KIND = { participants: "Participants", feedback: "Feedback" } as const;

// One pillar's consolidated database as a table on the site, with the same sheets as the Excel workbook.
export default async function ConsolidatedDatabasePage({
  params,
}: {
  params: Promise<{ portal: string; pillar: string; type: string }>;
}) {
  const { portal, pillar: rawPillar, type: rawType } = await params;
  if (!isPortal(portal)) notFound();
  const pillar = rawPillar.toUpperCase();
  if (!PILLARS.includes(pillar)) notFound();
  if (rawType !== "participants" && rawType !== "feedback") notFound();
  const type = rawType;
  // Pillar views show only their own pillar's database.
  if (portal !== "admin" && !(pillarsForPortal(portal) as string[]).includes(pillar)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();
  const { data: staff } = await supabase.from("staff_roles").select("role").eq("user_id", user.id).maybeSingle();
  if (!staff) notFound();

  const built = await buildConsolidated(supabase, pillar, type, staff.role === "admin");
  const sheets = built.sheets.map((s) => ({ name: s.name, columns: s.columns, headers: s.headers, rows: s.rows }));
  const total = built.recordCount;

  return (
    <section className="flex flex-col gap-6">
      <PageBand
        title={`${pillar} Consolidated ${KIND[type]}`}
        aside={
          <div className="inline-flex items-baseline gap-2">
            <span className="font-display text-2xl font-semibold tabular-nums text-white">{total}</span>
            <span className="text-sm text-[#D8E4F3]">total {type === "participants" ? "participant rows" : "feedback responses"}</span>
          </div>
        }
      >
        <p className="mt-2 max-w-2xl text-muted">
          The consolidated database as a table, with the workbook&apos;s sheets as tabs. Search, filter and sort here, then download the sheet in the format you choose.
        </p>
      </PageBand>
      <ConsolidatedTable pillar={pillar} type={type} sheets={sheets} />
    </section>
  );
}
