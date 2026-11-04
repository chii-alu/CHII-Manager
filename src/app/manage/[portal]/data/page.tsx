import { createClient } from "@/lib/supabase/server";
import { card, btnSm } from "@/components/ui/styles";
import { EXPORT_TABLES, type ExportTable } from "@/lib/export/tables";
import { isPortal } from "@/lib/auth/portals";
import { PORTAL_COPY } from "@/lib/portal-copy";
import { PageBand } from "@/components/ui/page-band";

const TABLE_INFO: Record<ExportTable, { description: string; links: string }> = {
  participants: { description: "One row per person.", links: "pid" },
  interventions: { description: "The interventions under each pillar and their type.", links: "id → sessions" },
  sessions: { description: "Each run of an intervention, with its dates and status.", links: "id, intervention_id" },
  registrations: { description: "Registrations and applications, with selection status and rubric score.", links: "session_id, pid" },
  attendance: { description: "One row per person per session date they were present.", links: "session_id, pid" },
  feedback: { description: "Standard feedback scores plus any session-specific answers.", links: "session_id, pid" },
};

const INDICATORS: [string, string][] = [
  ["Reach", "Unique participants by pillar, intervention and period; new vs returning people."],
  ["Conversion", "Applications → selected → attended → completed, for each selective session."],
  ["Attendance", "Turnout against registrations; completion (75%+ of dates) for multi-date programmes."],
  ["Inclusion", "Every indicator broken down by gender, age group, country, affiliation and disability."],
  ["Quality", "Satisfaction, relevance, NPS and pillar-specific ratings, compared across sessions."],
  ["Data health", "Sessions with missing attendance, unreviewed applications, low feedback response rates."],
];

const TABLE_NAME: Record<ExportTable, string> = {
  participants: "participants",
  interventions: "interventions",
  sessions: "sessions",
  registrations: "entries",
  attendance: "attendance",
  feedback: "feedback",
};

export default async function DataPage({ params }: { params: Promise<{ portal: string }> }) {
  const { portal } = await params;
  const copy = isPortal(portal) ? PORTAL_COPY[portal] : PORTAL_COPY.admin;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: staff } = user
    ? await supabase.from("staff_roles").select("role").eq("user_id", user.id).maybeSingle()
    : { data: null };
  const isAdmin = staff?.role === "admin";

  const counts = await Promise.all(
    EXPORT_TABLES.map(async (t) => {
      const { count } = await supabase.from(TABLE_NAME[t]).select("*", { count: "exact", head: true });
      return [t, count ?? 0] as const;
    }),
  );

  return (
    <section className="flex flex-col gap-8">
      <PageBand title="Data for the dashboard">
        <p className="mt-2 max-w-2xl text-muted">
          {copy.data}
        </p>
      </PageBand>

      <div className="overflow-x-auto rounded-[10px] border border-line bg-surface">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-brand text-left text-xs font-semibold text-on-accent">
            <tr>
              <th className="px-3 py-2">Table</th>
              <th className="px-3 py-2">What it holds</th>
              <th className="px-3 py-2 text-right">Rows</th>
              <th className="px-3 py-2">Links by</th>
              <th className="px-3 py-2">{isAdmin ? "Export" : ""}</th>
            </tr>
          </thead>
          <tbody>
            {counts.map(([t, n]) => (
              <tr key={t} className="border-t border-line">
                <td className="px-3 py-2 font-mono font-semibold">{TABLE_NAME[t]}</td>
                <td className="px-3 py-2">{TABLE_INFO[t].description}</td>
                <td className="px-3 py-2 text-right tabular-nums">{n}</td>
                <td className="px-3 py-2 font-mono text-xs">{TABLE_INFO[t].links}</td>
                <td className="px-3 py-2">
                  {isAdmin && (
                    <a className={btnSm} href={`/api/export/${t}`} download>
                      Download CSV
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <h2 className="font-display text-xl font-semibold">Indicators the dashboard can compute</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {INDICATORS.map(([name, desc]) => (
            <div key={name} className={card}>
              <h3 className="font-display text-base font-semibold">{name}</h3>
              <p className="mt-1 text-sm text-muted">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
