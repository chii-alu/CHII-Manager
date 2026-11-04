import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDateRange, todayIso } from "@/lib/dates";
import { sessionStatus } from "@/lib/rules/session-status";
import { PillarChip, StatusChip, TypeChip } from "@/components/manage/Chips";
import { SessionTabs } from "@/components/manage/SessionTabs";
import { currentStaffRole } from "@/lib/auth/roles";
import { visibleTabs } from "@/lib/sessions/tabs";
import { inPortal } from "@/lib/auth/portals";
import { PageBand } from "@/components/ui/page-band";

export default async function SessionLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ portal: string; id: string }>;
}) {
  const { portal, id } = await params;
  const supabase = await createClient();
  const role = await currentStaffRole(supabase);
  const { data: s } = await supabase
    .from("sessions")
    .select("id, title, pillar, kind, dates, mode, venue, capacity, application_deadline, interventions(id, name)")
    .eq("id", id)
    .maybeSingle();
  if (!s || !inPortal(portal, s.pillar)) notFound();

  // Pipeline numbers use the same definitions as v_session_summary (SPEC §3).
  const [{ data: entries }, { data: attendance }, { count: feedbackCount }] = await Promise.all([
    supabase.from("entries").select("status, participant_id").eq("session_id", id),
    supabase.from("attendance").select("participant_id").eq("session_id", id),
    supabase.from("feedback").select("id", { count: "exact", head: true }).eq("session_id", id),
  ]);
  const selectiveKind = s.kind === "application";
  const eligibleStatus = selectiveKind ? "selected" : "registered";
  const eligible = (entries ?? []).filter((e) => e.status === eligibleStatus).length;
  const attendees = new Set((attendance ?? []).map((a) => a.participant_id)).size;
  const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");
  const stages: [string, number, string][] = selectiveKind
    ? [
        ["Applications", entries?.length ?? 0, `${(entries ?? []).filter((e) => e.status === "applied").length} to review`],
        ["Selected", eligible, `${(entries ?? []).filter((e) => e.status === "shortlisted").length} shortlisted`],
        ["Attended", attendees, `${pct(attendees, eligible)} of selected`],
        ["Feedback", feedbackCount ?? 0, `${pct(feedbackCount ?? 0, attendees)} of attendees`],
      ]
    : [
        ["Registered", eligible, `${(entries?.length ?? 0) - eligible} waitlisted or cancelled`],
        ["Attended", attendees, `${pct(attendees, eligible)} turnout`],
        ["Feedback", feedbackCount ?? 0, `${pct(feedbackCount ?? 0, attendees)} response rate`],
      ];

  const iv = s.interventions as unknown as { id: string; name: string };
  const selective = s.kind === "application";
  const status = sessionStatus(s.dates, todayIso());
  const meta = [
    formatDateRange(s.dates),
    s.mode,
    s.venue,
    s.capacity ? `${s.capacity} places` : null,
    selective && s.application_deadline ? `applications close ${s.application_deadline}` : null,
  ].filter(Boolean);

  return (
    <section>
      <nav className="flex flex-wrap gap-1.5 text-sm text-muted">
        <Link href={`/manage/${portal}`} className="text-accent hover:underline">Overview</Link>
        <span>/</span>
        <span>{s.pillar}</span>
        <span>/</span>
        <Link href={`/manage/${portal}/interventions/${iv.id}`} className="text-accent hover:underline">{iv.name}</Link>
      </nav>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <PillarChip pillar={s.pillar} />
        <TypeChip type={selective ? "selective" : "open"} />
        <StatusChip status={status} />
      </div>
      <PageBand title={s.title}>
        <p className="text-muted">{meta.join(" · ")}</p>
      </PageBand>

      <div className="mt-5 grid overflow-hidden rounded-[10px] border border-line bg-surface sm:grid-cols-2 xl:grid-cols-4">
        {stages.map(([label, value, note]) => (
          <div key={label} className="border-b border-line p-3 last:border-b-0 sm:border-r sm:last:border-r-0 xl:border-b-0">
            <div className="text-xs font-semibold text-muted">{label}</div>
            <div className="font-display text-2xl font-semibold tabular-nums">{value}</div>
            <div className="text-xs text-muted">{note}</div>
          </div>
        ))}
      </div>

      <SessionTabs sessionId={s.id} selective={selective} visible={visibleTabs(role)} />
      <div className="mt-6">{children}</div>
    </section>
  );
}
