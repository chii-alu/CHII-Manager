import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isPortal, pillarsForPortal } from "@/lib/auth/portals";
import { formatDate } from "@/lib/dates";
import { card, input, btnSm } from "@/components/ui/styles";

const TABS = [
  { slug: "participants", label: "Participants", view: "v_participant_registry", columns: "chii_id, full_name, email, cohort, intervention, pillar, participation_status, registered_on, sessions_attended, sessions_total" },
  { slug: "attendance", label: "Attendance", view: "v_attendance_registry", columns: "chii_id, full_name, cohort, intervention, pillar, session_date, session_title, checked_in_at, method" },
  { slug: "feedback", label: "Feedback", view: "v_feedback_registry", columns: "chii_id, full_name, cohort, intervention, pillar, submitted_at, satisfaction, relevance, nps, most_useful, improve" },
] as const;

type Row = Record<string, string | number | null>;

// What a column is called on screen. The database column stays "cohort".
const headerFor = (column: string) => (column === "cohort" ? "session title" : column.replace(/_/g, " "));

// The CHII registries across pillars. What each person sees is decided by the database; this page only filters it.
export default async function ChiiRegistryPage({
  params,
  searchParams,
}: {
  params: Promise<{ portal: string }>;
  searchParams: Promise<{ tab?: string; intervention?: string; cohort?: string }>;
}) {
  const { portal } = await params;
  if (!isPortal(portal)) notFound();
  const { tab: tabParam, intervention, cohort } = await searchParams;
  const tab = TABS.find((t) => t.slug === tabParam) ?? TABS[0];

  const supabase = await createClient();
  // Pillar views only show that pillar. The admin view shows every pillar.
  const pillars = portal === "admin" ? null : pillarsForPortal(portal);

  let query = supabase.from(tab.view).select(tab.columns);
  if (pillars) query = query.in("pillar", pillars);
  if (intervention) query = query.eq("intervention", intervention);
  if (cohort) query = query.eq("cohort", cohort);
  const { data, error } = await query.order("cohort").limit(500);
  if (error) throw new Error(`Could not load the registry: ${error.message}`);
  const rows = (data ?? []) as unknown as Row[];

  // Filter choices come from the people visible here.
  let optionsQuery = supabase.from("v_participant_registry").select("intervention, cohort");
  if (pillars) optionsQuery = optionsQuery.in("pillar", pillars);
  const { data: options } = await optionsQuery;
  const interventions = [...new Set((options ?? []).map((o) => o.intervention).filter(Boolean) as string[])].sort();
  const cohorts = [...new Set((options ?? []).map((o) => o.cohort).filter(Boolean) as string[])].sort();

  const base = `/manage/${portal}/chii-registry`;
  const qs = new URLSearchParams({ portal, ...(intervention ? { intervention } : {}), ...(cohort ? { cohort } : {}) });
  const csvHref = `/api/registry/${tab.slug}?${qs.toString()}`;

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">CHII registry</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Participants, attendance and feedback recorded on the CHII tables. {portal === "admin" ? "All pillars." : "Your pillar only."}
        </p>
      </div>

      <nav className="flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <Link
            key={t.slug}
            href={`${base}?tab=${t.slug}${intervention ? `&intervention=${encodeURIComponent(intervention)}` : ""}${cohort ? `&cohort=${encodeURIComponent(cohort)}` : ""}`}
            aria-current={t.slug === tab.slug ? "page" : undefined}
            className={`border-b-2 px-3.5 py-2 text-sm font-medium ${t.slug === tab.slug ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <form method="get" className={`${card} grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end`}>
        <input type="hidden" name="tab" value={tab.slug} />
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Intervention
          <select name="intervention" defaultValue={intervention ?? ""} className={input}>
            <option value="">All interventions</option>
            {interventions.map((i) => (
              <option key={i} value={i}>{i}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Session title
          <select name="cohort" defaultValue={cohort ?? ""} className={input}>
            <option value="">All session titles</option>
            {cohorts.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <button type="submit" className={btnSm}>Apply</button>
        <a href={csvHref} className={btnSm}>Download CSV</a>
        <a href={`${csvHref}&format=xlsx`} className={btnSm}>Download XLSX</a>
      </form>

      <p className="text-sm text-muted">
        {rows.length === 500 ? "Showing the first 500 rows. Download the CSV for all of them." : `${rows.length} row${rows.length === 1 ? "" : "s"}.`}
      </p>

      <div className="overflow-x-auto rounded-[10px] border border-line bg-surface">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-brand text-left text-xs font-semibold text-on-accent">
            <tr>
              {Object.keys(rows[0] ?? Object.fromEntries(tab.columns.split(", ").map((c) => [c, null]))).map((c) => (
                <th key={c} className="whitespace-nowrap px-3 py-2">{headerFor(c)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-line align-top">
                {Object.entries(r).map(([k, v]) => (
                  <td key={k} className="px-3 py-2">{k.endsWith("_date") || k === "registered_on" || k === "submitted_at" || k === "checked_in_at" ? formatCell(v) : (v ?? "—")}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function formatCell(v: string | number | null) {
  if (typeof v !== "string") return v ?? "—";
  return v.length >= 10 ? formatDate(v.slice(0, 10)) : v;
}
