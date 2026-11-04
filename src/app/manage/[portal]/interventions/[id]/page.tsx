import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { todayIso, formatDateRange } from "@/lib/dates";
import { sessionStatus } from "@/lib/rules/session-status";
import { NewSessionDialog, type CopyOption } from "@/components/manage/NewSessionDialog";
import { TypeSelect } from "@/components/manage/TypeSelect";
import { PillarChip, StatusChip, TypeChip } from "@/components/manage/Chips";
import { card } from "@/components/ui/styles";
import { inPortal } from "@/lib/auth/portals";
import { PageBand } from "@/components/ui/page-band";

type SessionRow = {
  id: string;
  title: string;
  kind: "registration" | "application";
  dates: string[];
  mode: string | null;
  forms: { code: string; kind: string }[];
  entries: { count: number }[];
};

export default async function InterventionPage({ params }: { params: Promise<{ portal: string; id: string }> }) {
  const { portal, id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: iv } = await supabase.from("interventions").select("id, name, pillar, type").eq("id", id).maybeSingle();
  if (!iv || !user || !inPortal(portal, iv.pillar)) notFound();
  // Interventions with a standard feedback template name it in the "Start forms from" choice.
  const { count: templateCount } = await supabase
    .from("feedback_template")
    .select("intervention_id", { count: "exact", head: true })
    .eq("intervention_id", iv.id);
  const standardLabel = (templateCount ?? 0) > 0 ? `Standard ${iv.name} Template` : `Standard ${iv.pillar} template`;

  const { data: staff } = await supabase.from("staff_roles").select("role").eq("user_id", user.id).maybeSingle();
  const isAdmin = staff?.role === "admin";

  const { data: rows, error } = await supabase
    .from("sessions")
    .select("id, title, kind, dates, mode, forms(code, kind), entries(count)")
    .eq("intervention_id", iv.id)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Could not load sessions: ${error.message}`);
  const sessions = (rows ?? []) as unknown as SessionRow[];

  const today = todayIso();
  const firstDate = (s: SessionRow) => [...s.dates].sort()[0] ?? "";
  const sorted = [...sessions].sort((a, b) => firstDate(b).localeCompare(firstDate(a)));
  const selective = iv.type === "selective";
  const sessionIds = sessions.map((s) => s.id);
  const { data: people } = sessionIds.length
    ? await supabase.from("entries").select("participant_id").in("session_id", sessionIds)
    : { data: [] as { participant_id: string }[] };
  const uniqueParticipants = new Set((people ?? []).map((p) => p.participant_id)).size;
  const upcoming = sessions.filter((s) => sessionStatus(s.dates, today) === "Upcoming").length;

  const feedbackCount = sessions.length
    ? (
        await supabase
          .from("feedback")
          .select("id", { count: "exact", head: true })
          .in(
            "session_id",
            sessions.map((s) => s.id),
          )
      ).count
    : 0;

  const copyOptions: CopyOption[] = sorted.map((s) => ({
    id: s.id,
    label: `${s.title} (${formatDateRange(s.dates).split(" · ")[0]})`,
  }));

  return (
    <section>
      <nav className="flex flex-wrap gap-1.5 text-sm text-muted">
        <Link href={`/manage/${portal}`} className="text-accent hover:underline">Overview</Link>
        <span>/</span>
        <span>{iv.pillar}</span>
      </nav>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <PillarChip pillar={iv.pillar} />
            <TypeChip type={iv.type} />
          </div>
          <PageBand title={iv.name}>
          <p className="max-w-2xl">
            {selective
              ? "Application → Selection → Attendance → Feedback."
              : "Registration → Attendance → Feedback."}{" "}
            Each new session gets its own copy of these forms, which you can then edit for that session.
          </p>
          </PageBand>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && <TypeSelect interventionId={iv.id} type={iv.type} />}
          <NewSessionDialog
            interventionId={iv.id}
            interventionName={iv.name}
            standardLabel={standardLabel}
            pillar={iv.pillar}
            selective={selective}
            copyOptions={copyOptions}
          />
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi value={sessions.length} label="sessions" />
        <Kpi value={uniqueParticipants} label="unique participants" />
        <Kpi value={upcoming} label="upcoming" />
        <Kpi value={feedbackCount ?? 0} label="feedback responses" />
      </div>

      <h2 className="mt-8 font-display text-xl font-semibold">Sessions</h2>
      {sorted.length === 0 ? (
        <div className={`${card} mt-3 text-center text-muted`}>No sessions yet. Create the first one to generate its forms.</div>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-[10px] border border-line bg-surface">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-brand text-left text-xs font-semibold text-on-accent">
              <tr>
                <th className="px-3 py-2">Session</th>
                <th className="px-3 py-2">Dates</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Delivery</th>
                <th className="px-3 py-2 text-right">{selective ? "Applications" : "Registrations"}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((s) => {
                const intakeCode = s.forms.find((f) => f.kind === "intake")?.code.replace(/-(REG|APP)$/, "");
                return (
                  <tr key={s.id} className="border-t border-line hover:bg-sunk">
                    <td className="px-3 py-2">
                      <Link href={`/manage/${portal}/sessions/${s.id}/forms`} className="font-semibold text-accent hover:underline">
                        {s.title}
                      </Link>
                      {intakeCode && <div className="font-mono text-xs text-muted">{intakeCode}</div>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">{formatDateRange(s.dates)}</td>
                    <td className="px-3 py-2">
                      <StatusChip status={sessionStatus(s.dates, today)} />
                    </td>
                    <td className="px-3 py-2">{s.mode ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.entries[0]?.count ?? 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Kpi({ value, label }: { value: number | string; label: string }) {
  return (
    <div className={card}>
      <div className="font-display text-3xl font-semibold tabular-nums">{value}</div>
      <div className="text-sm text-muted">{label}</div>
    </div>
  );
}
