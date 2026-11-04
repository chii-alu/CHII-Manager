import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDateRange, todayIso } from "@/lib/dates";
import { PillarChip, StatusChip, TypeChip } from "@/components/manage/Chips";
import { STATUS_LABEL, type EntryStatus } from "@/lib/sessions/status";
import { isCompleted } from "@/lib/rules/completion";
import { sessionStatus } from "@/lib/rules/session-status";
import { card } from "@/components/ui/styles";
import { isPortal, pillarsForPortal } from "@/lib/auth/portals";
import { AnonymiseButton } from "@/components/manage/AnonymiseButton";
import { PageBand } from "@/components/ui/page-band";
import { PARTICIPANT_COLUMNS } from "@/lib/workbooks/columns";
import { ArrowLeft } from "lucide-react";

type Journey = {
  status: EntryStatus;
  sessions: {
    id: string;
    title: string;
    pillar: string;
    kind: "registration" | "application";
    dates: string[];
    completion_threshold: number;
    interventions: { name: string };
  };
};

export default async function ParticipantPage({ params }: { params: Promise<{ portal: string; pid: string }> }) {
  const { portal, pid } = await params;
  const supabase = await createClient();

  const { data: p } = await supabase
    .from("participants")
    .select("id, pid, name, email, phone, gender, age_group, country, affiliation, disability, consent_at")
    .eq("pid", pid)
    .maybeSingle();
  if (!p) notFound();

  // The person's CHII record: every demographic column from the participant workbook, across all interventions.
  const { data: chiiRows } = await supabase.from("v_workbook_participants").select("*").eq("chii_id", pid).limit(1);
  const chii = (chiiRows?.[0] ?? null) as Record<string, string | number | null> | null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: staff } = user ? await supabase.from("staff_roles").select("role").eq("user_id", user.id).maybeSingle() : { data: null };

  const [{ data: entries }, { data: attendance }, { data: feedback }] = await Promise.all([
    supabase
      .from("entries")
      .select("status, sessions(id, title, pillar, kind, dates, completion_threshold, interventions(name))")
      .eq("participant_id", p.id),
    supabase.from("attendance").select("session_id, date").eq("participant_id", p.id),
    supabase.from("feedback").select("session_id").eq("participant_id", p.id),
  ]);

  // Pillar views show only the sessions of that pillar, and a person with none there is not found.
  const visible = isPortal(portal) && portal !== "admin" ? new Set<string>(pillarsForPortal(portal)) : null;
  const journey = ((entries ?? []) as unknown as Journey[])
    .filter((j) => j.sessions && (!visible || visible.has(j.sessions.pillar)))
    .sort((a, b) => (a.sessions.dates[0] ?? "").localeCompare(b.sessions.dates[0] ?? ""));
  if (visible && journey.length === 0) notFound();
  const today = todayIso();

  return (
    <section className="flex flex-col gap-6">
      <div>
        <Link
          href={`/manage/${portal}/registry`}
          className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#C9D3E3] bg-white px-3.5 py-1.5 text-sm font-semibold text-[#14306B] shadow-[0_1px_2px_rgba(16,44,94,0.06)] transition-colors hover:border-[#14306B] hover:bg-[#EEF3FB] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4F93E0] motion-reduce:transition-none"
        >
          <ArrowLeft size={16} aria-hidden />
          Back to CHII Participants
        </Link>
        <PageBand title={String(chii?.names ?? p.name)}>
          <p className="font-mono text-sm">{p.pid}</p>
        </PageBand>
        {staff?.role === "admin" && (
          <div className="mt-3">
            <AnonymiseButton pid={p.pid} name={p.name} />
          </div>
        )}
      </div>

      <div className={`${card} grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-3`}>
        {PARTICIPANT_COLUMNS.map(([key, header]) => (
          <Field key={key} k={header} v={chii?.[key] === undefined || chii?.[key] === null ? null : String(chii[key])} />
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="font-display text-xl font-semibold">Journey across interventions</h2>
        {journey.length === 0 ? (
          <div className={`${card} text-muted`}>No activity yet.</div>
        ) : (
          <ul className="flex flex-col gap-2">
            {journey.map((j) => {
              const s = j.sessions;
              const eligible = s.kind === "application" ? j.status === "selected" : j.status === "registered";
              const attendedDays = (attendance ?? []).filter((a) => a.session_id === s.id).length;
              const gaveFeedback = (feedback ?? []).some((f) => f.session_id === s.id);
              return (
                <li key={s.id}>
                  <Link href={`/manage/${portal}/sessions/${s.id}/forms`} className={`${card} grid items-center gap-3 sm:grid-cols-[auto_1fr_auto]`}>
                    <PillarChip pillar={s.pillar} />
                    <span>
                      <span className="block font-semibold">{s.title}</span>
                      <span className="text-sm text-muted">
                        {s.interventions.name} · {formatDateRange(s.dates)} · <StatusChip status={sessionStatus(s.dates, today)} />
                      </span>
                    </span>
                    <span className="flex flex-wrap items-center justify-end gap-2 text-sm">
                      <TypeChip type={s.kind === "application" ? "selective" : "open"} />
                      <span className="rounded-md bg-sunk px-2 py-0.5 text-xs font-semibold">{STATUS_LABEL[j.status]}</span>
                      {eligible && (
                        <span className="text-muted">
                          attended {attendedDays}/{s.dates.length}
                          {isCompleted(attendedDays, s.dates.length, Number(s.completion_threshold)) ? " · completed" : ""}
                        </span>
                      )}
                      {gaveFeedback && <span className="text-muted">· feedback given</span>}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

function Field({ k, v }: { k: string; v: string | null }) {
  return (
    <div>
      <div className="text-xs text-muted">{k}</div>
      <div>{v || "—"}</div>
    </div>
  );
}
