import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDateRange, todayIso } from "@/lib/dates";
import { sessionStatus } from "@/lib/rules/session-status";
import { needsAttention, type AttentionSession } from "@/lib/rules/attention";
import { isPortal, pillarsForPortal } from "@/lib/auth/portals";
import { Card } from "@/components/ui/card";
import { SectionTitle } from "@/components/ui/section-title";
import { AlertTriangle, CalendarDays } from "lucide-react";
import { HealthDot, StatusPill, type Tone } from "@/components/ui/status-pill";
import { PillarPill, PILLAR_COLOUR } from "@/components/ui/pillar-pill";
import { Stat } from "@/components/ui/stat";

type Row = {
  id: string;
  title: string;
  pillar: string;
  kind: "registration" | "application";
  dates: string[];
  interventions: { name: string };
  forms: { kind: string; code: string; status: "draft" | "open" | "closed" }[];
  entries: { status: string; participant_id: string }[];
  attendance: { date: string; participant_id: string }[];
  feedback: { id: string }[];
};

const STATUS_TONE: Record<string, Tone> = { Upcoming: "info", "In progress": "good", Completed: "neutral", "Not scheduled": "neutral" };

// Overview: each pillar's numbers and health, what needs attention, and every session.
export default async function OverviewPage({ params }: { params: Promise<{ portal: string }> }) {
  const { portal } = await params;
  if (!isPortal(portal)) notFound();
  const pillars = pillarsForPortal(portal);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sessions")
    .select(
      "id, title, pillar, kind, dates, interventions(name), forms(kind, code, status), entries(status, participant_id), attendance(date, participant_id), feedback(id)",
    )
    .in("pillar", pillars);
  if (error) throw new Error(`Could not load sessions: ${error.message}`);

  const today = todayIso();
  const rows = (data ?? []) as unknown as Row[];
  const sorted = [...rows].sort((a, b) => [...b.dates].sort()[0]?.localeCompare([...a.dates].sort()[0] ?? "") ?? 0);

  const attention = needsAttention(
    rows.map<AttentionSession>((r) => {
      const selective = r.kind === "application";
      const eligibleStatus = selective ? "selected" : "registered";
      return {
        id: r.id,
        label: `${r.pillar} · ${r.title}`,
        selective,
        dates: r.dates,
        applied: r.entries.filter((e) => e.status === "applied").length,
        eligible: r.entries.filter((e) => e.status === eligibleStatus).length,
        intakeStatus: r.forms.find((f) => f.kind === "intake")?.status ?? "draft",
        feedbackStatus: r.forms.find((f) => f.kind === "feedback")?.status ?? "draft",
        attendanceDates: new Set(r.attendance.map((a) => a.date)),
      };
    }),
    today,
  );

  // A pillar's health: red if any item is a problem, amber if any needs attention, otherwise green.
  const healthOf = (pillar: string): "good" | "warn" | "bad" => {
    const mine = attention.filter((a) => a.detail.startsWith(`${pillar} ·`));
    if (mine.some((a) => a.tone === "bad")) return "bad";
    if (mine.length > 0) return "warn";
    return "good";
  };

  return (
    <section className="flex flex-col gap-8">
      <header className="flex flex-col gap-5 rounded-[16px] bg-[#102C5E] p-6 text-white shadow-[0_8px_24px_rgba(16,44,94,0.18)] md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-[30px] font-semibold leading-tight">Overview</h1>
          <p className="max-w-2xl text-[15px] text-[#D8E4F3]">
            Sessions, people and attendance across your pillars, with what needs attention first.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-xl bg-white/10 px-4 py-2.5 text-center ring-1 ring-white/15">
            <div className="font-display text-2xl font-semibold tabular-nums">{attention.length}</div>
            <div className="text-xs text-[#D8E4F3]">need attention</div>
          </div>
          <div className="rounded-xl bg-white/10 px-4 py-2.5 text-center ring-1 ring-white/15">
            <div className="font-display text-2xl font-semibold tabular-nums">{rows.length}</div>
            <div className="text-xs text-[#D8E4F3]">sessions</div>
          </div>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        {pillars.map((p) => {
          const ss = rows.filter((r) => r.pillar === p);
          const people = new Set(ss.flatMap((r) => r.entries.map((e) => e.participant_id))).size;
          const attendances = new Set(ss.flatMap((r) => r.attendance.map((a) => `${r.id}:${a.participant_id}`))).size;
          const health = healthOf(p);
          return (
            <Card key={p} accent={PILLAR_COLOUR[p]?.bar}>
              <div className="flex items-center justify-between">
                <h2 className="font-display text-xl font-semibold text-[#102C5E]">{p}</h2>
                <div className="flex items-center gap-2">
                  <HealthDot tone={health} label={`${p} health: ${health === "good" ? "on track" : health === "warn" ? "needs attention" : "problem"}`} />
                  <PillarPill pillar={p} />
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <Stat value={ss.length} label="sessions" />
                <Stat value={people} label="unique people" />
                <Stat value={attendances} label="attendances" />
              </div>
            </Card>
          );
        })}
      </div>

      <section className="flex flex-col gap-3">
        <SectionTitle
          icon={AlertTriangle}
          title="Needs attention"
          description="Fix these so sessions stay on track."
          count={attention.length}
        />
        <Card className="p-0">
          {attention.length === 0 ? (
            <p className="p-6 text-center text-[#5E6C84]">Nothing waiting. Every session is up to date.</p>
          ) : (
            <ul className="divide-y divide-[#E3E8F0]">
              {attention.map((a, i) => (
                <li key={i} className="flex items-center justify-between gap-4 p-4">
                  <div className="flex items-start gap-3">
                    <span className="mt-1.5">
                      <HealthDot tone={a.tone === "bad" ? "bad" : a.tone === "warn" ? "warn" : "good"} />
                    </span>
                    <div>
                      <p className="font-semibold text-[#172B4D]">{a.text}</p>
                      <p className="text-sm text-[#5E6C84]">{a.detail}</p>
                    </div>
                  </div>
                  <Link
                    href={`/manage/${portal}/sessions/${a.sessionId}/${a.tab}`}
                    className="shrink-0 rounded-lg border border-[#C9D3E3] bg-white px-3 py-1.5 text-sm font-semibold text-[#14306B] hover:border-[#14306B]"
                  >
                    Fix
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle icon={CalendarDays} title="All sessions" description="Every session in your pillars, newest first." count={rows.length} />
        {sorted.length === 0 ? (
          <Card className="text-center text-[#5E6C84]">No sessions yet. Open an intervention and create its first session.</Card>
        ) : (
          <div className="overflow-x-auto rounded-[14px] border border-[#E3E8F0] bg-white">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-[#102C5E] text-left text-xs font-semibold text-white">
                <tr>
                  <th className="px-4 py-3">Session</th>
                  <th className="px-4 py-3">Pillar</th>
                  <th className="px-4 py-3">Dates</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Registered</th>
                  <th className="px-4 py-3 text-right">Attended</th>
                  <th className="px-4 py-3 text-right">Feedback</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => {
                  const status = sessionStatus(r.dates, today);
                  return (
                    <tr key={r.id} className="border-t border-[#E3E8F0] hover:bg-[#F5F7FA]">
                      <td className="px-4 py-3">
                        <Link href={`/manage/${portal}/sessions/${r.id}/forms`} className="font-semibold text-[#14306B] hover:underline">
                          {r.title}
                        </Link>
                        <div className="text-xs text-[#5E6C84]">{r.interventions.name}</div>
                      </td>
                      <td className="px-4 py-3">
                        <PillarPill pillar={r.pillar} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-[#172B4D]">{formatDateRange(r.dates)}</td>
                      <td className="px-4 py-3">
                        <StatusPill tone={STATUS_TONE[status] ?? "neutral"}>{status}</StatusPill>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{r.entries.length}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{new Set(r.attendance.map((a) => a.participant_id)).size}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{r.feedback.length}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}
