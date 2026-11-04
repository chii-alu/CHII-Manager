import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isPortal, pillarsForPortal } from "@/lib/auth/portals";
import { ImportForm } from "@/components/manage/ImportForm";
import { PageBand } from "@/components/ui/page-band";

// Sheet importer: upload a sheet, check the column mapping, and see the dry run before anything is written.
export default async function ImportPage({ params }: { params: Promise<{ portal: string }> }) {
  const { portal } = await params;
  if (!isPortal(portal)) notFound();
  const supabase = await createClient();
  const pillars = portal === "admin" ? (["HENT", "HEMP", "HECO"] as const) : pillarsForPortal(portal);
  const { data: ivs } = await supabase.from("interventions").select("id, name, pillar").in("pillar", [...pillars]).eq("active", true).order("name");
  const interventions = (ivs ?? []) as { id: string; name: string; pillar: string }[];
  const { data: cohortRows } = await supabase.from("cohort").select("id, label, intervention_id").order("label");
  const cohorts = (cohortRows ?? []) as { id: string; label: string; intervention_id: string }[];

  return (
    <section className="flex flex-col gap-6">
      <PageBand title="Import a sheet">
        <p className="mt-2 max-w-2xl text-muted">
          Upload a CSV or XLSX file of registrations or feedback. The dry run checks every row and shows what would be imported. Nothing is saved until you confirm.
        </p>
      </PageBand>
      <ImportForm portal={portal} interventions={interventions} cohorts={cohorts} />
    </section>
  );
}
