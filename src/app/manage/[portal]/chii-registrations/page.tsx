import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PillarChip } from "@/components/manage/Chips";
import { formatDate } from "@/lib/dates";
import { card } from "@/components/ui/styles";
import { PageBand } from "@/components/ui/page-band";

type CohortRow = {
  id: string;
  label: string;
  start_date: string | null;
  end_date: string | null;
  mode: string | null;
  interventions: { name: string; pillar: string } | null;
};

// Every registration, attendance, feedback and review on the CHII tables, across all pillars. MELA admins only.
export default async function ChiiRegistrationsPage({ params }: { params: Promise<{ portal: string }> }) {
  const { portal } = await params;
  if (portal !== "admin") notFound();
  const supabase = await createClient();

  const [{ data: cohorts }, { data: participants }, { data: applications }, { data: meetings }, { data: attendance }, { data: feedback }, { data: reviews }] =
    await Promise.all([
      supabase.from("cohort").select("id, label, start_date, end_date, mode, interventions(name, pillar)").order("start_date", { ascending: false }),
      supabase.from("participation").select("chii_id, cohort_id, status, registered_on").order("registered_on", { ascending: false }),
      supabase.from("application").select("id, cohort_id"),
      supabase.from("session_meeting").select("id, cohort_id"),
      supabase.from("session_attendance").select("session_id, chii_id"),
      supabase.from("cohort_feedback").select("cohort_id"),
      supabase.from("selection_review").select("application_id"),
    ]);

  const chiiIds = [...new Set((participants ?? []).map((p) => p.chii_id))];
  const { data: identities } = chiiIds.length
    ? await supabase.from("beneficiary_identity").select("chii_id, full_name, email").in("chii_id", chiiIds)
    : { data: [] as { chii_id: string; full_name: string; email: string | null }[] };
  const who = new Map((identities ?? []).map((i) => [i.chii_id, i]));

  const meetingCohort = new Map((meetings ?? []).map((m) => [m.id, m.cohort_id]));
  const cohortOfApplication = new Map((applications ?? []).map((a) => [a.id, a.cohort_id]));

  const rows = ((cohorts ?? []) as unknown as CohortRow[]).map((c) => {
    const regs = (participants ?? []).filter((p) => p.cohort_id === c.id);
    const attended = new Set((attendance ?? []).filter((a) => meetingCohort.get(a.session_id) === c.id).map((a) => a.chii_id)).size;
    return {
      cohort: c,
      registrations: regs,
      applications: (applications ?? []).filter((a) => a.cohort_id === c.id).length,
      attended,
      feedback: (feedback ?? []).filter((f) => f.cohort_id === c.id).length,
      reviews: (reviews ?? []).filter((r) => cohortOfApplication.get(r.application_id) === c.id).length,
    };
  });

  return (
    <section className="flex flex-col gap-6">
      <PageBand title="CHII registrations">
        <p className="mt-2 max-w-2xl text-muted">
          Everything recorded on the CHII tables, across all pillars and reviewers. Visible to MELA admins only.
        </p>
      </PageBand>

      {rows.length === 0 ? (
        <div className={`${card} text-center text-muted`}>No session titles yet.</div>
      ) : (
        rows.map((r) => (
          <div key={r.cohort.id} className={`${card} flex flex-col gap-4`}>
            <div className="flex flex-wrap items-center gap-3">
              {r.cohort.interventions && <PillarChip pillar={r.cohort.interventions.pillar} />}
              <h2 className="font-display text-xl font-semibold">
                {r.cohort.interventions?.name} · {r.cohort.label}
              </h2>
              <span className="text-sm text-muted">
                {r.cohort.start_date ? formatDate(r.cohort.start_date) : "No start date"}
                {r.cohort.mode ? ` · ${r.cohort.mode}` : ""}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
              <Stat value={r.registrations.length} label="registered" />
              <Stat value={r.applications} label="applications" />
              <Stat value={r.attended} label="attended" />
              <Stat value={r.feedback} label="feedback" />
              <Stat value={r.reviews} label="reviews" />
            </div>

            {r.registrations.length > 0 && (
              <div className="overflow-x-auto rounded-md border border-line">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-brand text-left text-xs font-semibold text-on-accent">
                    <tr>
                      <th className="px-3 py-2">Name</th>
                      <th className="px-3 py-2">Email</th>
                      <th className="px-3 py-2">CHII ID</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Registered</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.registrations.map((p) => (
                      <tr key={p.chii_id} className="border-t border-line">
                        <td className="px-3 py-2">{who.get(p.chii_id)?.full_name || "—"}</td>
                        <td className="px-3 py-2">{who.get(p.chii_id)?.email ?? "—"}</td>
                        <td className="px-3 py-2 font-mono text-xs">{p.chii_id}</td>
                        <td className="px-3 py-2">{p.status}</td>
                        <td className="px-3 py-2">{formatDate(p.registered_on)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))
      )}
    </section>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="font-display text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}
