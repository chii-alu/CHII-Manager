import { createClient } from "@/lib/supabase/server";
import { RegistryTable, type RegistryRow } from "@/components/manage/RegistryTable";
import { isPortal, pillarsForPortal } from "@/lib/auth/portals";
import { PORTAL_COPY } from "@/lib/portal-copy";

export default async function RegistryPage({ params }: { params: Promise<{ portal: string }> }) {
  const { portal } = await params;
  const copy = isPortal(portal) ? PORTAL_COPY[portal] : PORTAL_COPY.admin;
  const supabase = await createClient();

  const [{ data: people, error }, { data: entries }, { data: attendance }] = await Promise.all([
    supabase.from("participants").select("id, pid, name, email, gender, age_group, country").order("pid"),
    supabase.from("entries").select("participant_id, session_id, sessions(pillar)"),
    supabase.from("attendance").select("participant_id, session_id"),
  ]);
  if (error) throw new Error(`Could not load participants: ${error.message}`);

  // Pillar views list only the people registered for that pillar. Admins see everyone.
  const visible = isPortal(portal) ? pillarsForPortal(portal) : [];
  const rows: RegistryRow[] = (people ?? []).map((p) => {
    const mine = (entries ?? []).filter((e) => e.participant_id === p.id);
    const pillars = [...new Set(mine.map((e) => (e.sessions as unknown as { pillar: string } | null)?.pillar).filter(Boolean))] as string[];
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
    };
  }).filter((r) => portal === "admin" || r.pillars.some((pillar) => visible.includes(pillar as (typeof visible)[number])));

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Participant registry</h1>
        <p className="mt-2 max-w-2xl text-muted">
          {copy.registry}
        </p>
      </div>
      <RegistryTable rows={rows} />
    </section>
  );
}
