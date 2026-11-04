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
        <Link href={`/manage/${portal}/registry`} className="text-sm text-accent hover:underline">← Participant registry</Link>
        <h1 className="mt-2 font-display text-3xl font-semibold">{p.name}</h1>
        <p className="font-mono text-sm text-muted">
          {p.pid} · {p.email}
        </p>
        {staff?.role === "admin" && (
          <div className="mt-3">
            <AnonymiseButton pid={p.pid} name={p.name} />
          </div>
        )}
      </div>

      <div className={`${card} grid gap-3 text-sm sm:grid-cols-3`}>
        <Field k="Phone" v={p.phone} />
        <Field k="Gender" v={p.gender} />
        <Field k="Age group" v={p.age_group} />
        <Field k="Country" v={p.country} />
        <Field k="Affiliation" v={p.affiliation} />
        <Field k="Disability" v={p.disability} />
        <Field k="Consent recorded" v={p.consent_at ? new Date(p.consent_at).toLocaleDateString("en-GB") : null} />
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
