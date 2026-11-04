import { createClient } from "@/lib/supabase/server";
import { RegistryTable, type RegistryRow } from "@/components/manage/RegistryTable";
import { isPortal, pillarsForPortal } from "@/lib/auth/portals";
import { PORTAL_COPY } from "@/lib/portal-copy";
import { PageBand } from "@/components/ui/page-band";
import { FilterBar } from "@/components/ui/filter-bar";

export default async function RegistryPage({
  params,
  searchParams,
}: {
  params: Promise<{ portal: string }>;
  searchParams: Promise<{ pillar?: string; intervention?: string; from?: string; to?: string }>;
}) {
  const { portal } = await params;
  const filters = await searchParams;
  const copy = isPortal(portal) ? PORTAL_COPY[portal] : PORTAL_COPY.admin;
  const supabase = await createClient();

  const [{ data: people, error }, { data: entries }, { data: attendance }] = await Promise.all([
    supabase.from("participants").select("id, pid, name, email, gender, age_group, country").order("pid"),
    supabase.from("entries").select("participant_id, session_id, sessions(pillar, dates, interventions(name))"),
    supabase.from("attendance").select("participant_id, session_id"),
  ]);
  if (error) throw new Error(`Could not load participants: ${error.message}`);

  // Pillar views list only the people registered for that pillar. Admins see everyone.
  const visible = isPortal(portal) ? pillarsForPortal(portal) : [];
  type Session = { pillar: string; dates: string[]; interventions: { name: string } | null };
  const all: (RegistryRow & { interventionNames: string[]; sessionDates: string[] })[] = (people ?? []).map((p) => {
    const mine = (entries ?? []).filter((e) => e.participant_id === p.id);
    const sessionsOf = mine.map((e) => e.sessions as unknown as Session | null).filter(Boolean) as Session[];
    const pillars = [...new Set(sessionsOf.map((x) => x.pillar))];
    const interventionNames = [...new Set(sessionsOf.map((x) => x.interventions?.name).filter(Boolean) as string[])];
    const sessionDates = sessionsOf.flatMap((x) => x.dates ?? []);
    const sessions = new Set(mine.map((e) => e.session_id)).size;
    const attended = new Set((attendance ?? []).filter((a) => a.participant_id === p.id).map((a) => a.session_id)).size;
    return {
      pid: p.pid,
      name: p.name,
      email: p.email,
      gender: p.gender,
      age: p.age_group,
      country: p.country,
      pillars,
      sessions,
      attended,
      interventionNames,
      sessionDates,
    };
  }).filter((r) => portal === "admin" || r.pillars.some((pillar) => visible.includes(pillar as (typeof visible)[number])));

  // Filter choices come from the people in view.
  const interventionOptions = [...new Set(all.flatMap((r) => r.interventionNames))].sort();
  const pillarOptions = portal === "admin" ? ["HENT", "HEMP", "HECO"] : undefined;

  const rows: RegistryRow[] = all.filter((r) => {
    if (filters.pillar && !r.pillars.includes(filters.pillar)) return false;
    if (filters.intervention && !r.interventionNames.includes(filters.intervention)) return false;
    if (filters.from || filters.to) {
      const inRange = r.sessionDates.some((d) => (!filters.from || d >= filters.from) && (!filters.to || d <= filters.to));
      if (!inRange) return false;
    }
    return true;
  }).map((r) => ({
    pid: r.pid,
    name: r.name,
    email: r.email,
    gender: r.gender,
    age: r.age,
    country: r.country,
    pillars: r.pillars,
    sessions: r.sessions,
    attended: r.attended,
  }));

  return (
    <section className="flex flex-col gap-6">
      <PageBand title="CHII Participants">
        <p className="mt-2 max-w-2xl text-muted">
          {copy.registry}
        </p>
        <div className="mt-3 inline-flex items-baseline gap-2 self-start rounded-xl bg-white/10 px-4 py-2.5 ring-1 ring-white/15">
          <span className="font-display text-2xl font-semibold tabular-nums text-white">{rows.length}</span>
          <span className="text-sm text-[#D8E4F3]">total participants</span>
        </div>
      </PageBand>
      <FilterBar pillars={pillarOptions} interventions={interventionOptions} values={filters} />
      <RegistryTable rows={rows} />
    </section>
  );
}
