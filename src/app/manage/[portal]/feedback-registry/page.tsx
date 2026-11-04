import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isPortal, pillarsForPortal } from "@/lib/auth/portals";
import { PORTAL_COPY } from "@/lib/portal-copy";
import { PillarChip } from "@/components/manage/Chips";
import { formatDate } from "@/lib/dates";
import { card } from "@/components/ui/styles";
import { PageBand } from "@/components/ui/page-band";
import { FilterBar } from "@/components/ui/filter-bar";

type FeedbackRow = {
  satisfaction: number;
  relevance: number;
  nps: number;
  most_useful: string | null;
  improve: string | null;
  submitted_at: string;
  session_id: string;
  participants: { pid: string } | null;
  sessions: { title: string; pillar: string; interventions: { name: string } | null };
};

// Every feedback response across the sessions of this portal, newest first.
export default async function FeedbackRegistryPage({
  params,
  searchParams,
}: {
  params: Promise<{ portal: string }>;
  searchParams: Promise<{ pillar?: string; intervention?: string; from?: string; to?: string }>;
}) {
  const { portal } = await params;
  const filters = await searchParams;
  if (!isPortal(portal)) notFound();
  const copy = PORTAL_COPY[portal];
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("feedback")
    .select(
      "satisfaction, relevance, nps, most_useful, improve, submitted_at, session_id, participants(pid), sessions!inner(title, pillar, interventions(name))",
    )
    .in("sessions.pillar", pillarsForPortal(portal))
    .order("submitted_at", { ascending: false });
  if (error) throw new Error(`Could not load feedback: ${error.message}`);

  const all = (data ?? []) as unknown as FeedbackRow[];
  const interventionOptions = [...new Set(all.map((r) => r.sessions.interventions?.name).filter(Boolean) as string[])].sort();
  const pillarOptions = portal === "admin" ? ["HENT", "HEMP", "HECO"] : undefined;
  const rows = all.filter((r) => {
    if (filters.pillar && r.sessions.pillar !== filters.pillar) return false;
    if (filters.intervention && r.sessions.interventions?.name !== filters.intervention) return false;
    const day = r.submitted_at.slice(0, 10);
    if (filters.from && day < filters.from) return false;
    if (filters.to && day > filters.to) return false;
    return true;
  });

  return (
    <section className="flex flex-col gap-6">
      <PageBand title="CHII Feedbacks">
        <p className="mt-2 max-w-2xl text-muted">{copy.feedback}</p>
        <div className="mt-3 inline-flex items-baseline gap-2 self-start rounded-xl bg-white/10 px-4 py-2.5 ring-1 ring-white/15">
          <span className="font-display text-2xl font-semibold tabular-nums text-white">{rows.length}</span>
          <span className="text-sm text-[#D8E4F3]">total feedbacks</span>
        </div>
      </PageBand>

      <FilterBar pillars={pillarOptions} interventions={interventionOptions} values={filters} />

      {rows.length === 0 ? (
        <div className={`${card} text-center text-muted`}>No feedback responses yet.</div>
      ) : (
        <div className="overflow-x-auto rounded-[10px] border border-line bg-surface">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-brand text-left text-xs font-semibold text-on-accent">
              <tr>
                <th className="px-3 py-2">CHII ID</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Pillar</th>
                <th className="px-3 py-2">Intervention</th>
                <th className="px-3 py-2">Session</th>
                <th className="px-3 py-2 text-right">Satisfaction</th>
                <th className="px-3 py-2 text-right">Relevance</th>
                <th className="px-3 py-2 text-right">NPS</th>
                <th className="px-3 py-2">Most useful</th>
                <th className="px-3 py-2">To improve</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.session_id}-${i}`} className="border-t border-line align-top hover:bg-sunk">
                  <td className="px-3 py-2">
                    {r.participants?.pid ? (
                      <Link href={`/manage/${portal}/registry/${r.participants.pid}`} className="font-mono text-xs text-accent hover:underline">
                        {r.participants.pid}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">{formatDate(r.submitted_at.slice(0, 10))}</td>
                  <td className="px-3 py-2"><PillarChip pillar={r.sessions.pillar} /></td>
                  <td className="px-3 py-2">{r.sessions.interventions?.name ?? "—"}</td>
                  <td className="px-3 py-2">
                    <Link href={`/manage/${portal}/sessions/${r.session_id}/feedback`} className="font-semibold text-accent hover:underline">
                      {r.sessions.title}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.satisfaction}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.relevance}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.nps}</td>
                  <td className="max-w-xs px-3 py-2 text-muted">{r.most_useful ?? ""}</td>
                  <td className="max-w-xs px-3 py-2 text-muted">{r.improve ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
