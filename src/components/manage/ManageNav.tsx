"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AddInterventionDialog } from "./AddInterventionDialog";

export type NavIntervention = {
  id: string;
  name: string;
  type: "open" | "selective";
  sessionCount: number;
};
export type NavPillar = {
  pillar: "HENT" | "HEMP" | "HECO";
  interventions: NavIntervention[];
};

const PILLAR_COLOR: Record<NavPillar["pillar"], string> = {
  HENT: "var(--hent)",
  HEMP: "var(--hemp)",
  HECO: "var(--heco)",
};

function NavLink({
  href,
  children,
  count,
}: {
  href: string;
  children: React.ReactNode;
  count?: number;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(href + "/");
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm ${
        active ? "font-semibold text-accent" : "text-muted hover:bg-sunk"
      }`}
    >
      {children}
      {count !== undefined && (
        <span className={`ml-auto text-xs tabular-nums ${active ? "text-accent" : "text-muted"}`}>
          {count || ""}
        </span>
      )}
    </Link>
  );
}

// A sidebar heading that folds its links away. Used for every group heading.
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <details open className="group">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-2.5 pb-1.5 pt-4 text-xs font-semibold tracking-wider text-muted hover:text-ink [&::-webkit-details-marker]:hidden">
        {title}
        <span
          aria-hidden
          className="ml-auto text-sm transition-transform group-open:rotate-90"
        >
          ›
        </span>
      </summary>
      {children}
    </details>
  );
}

export function ManageNav({
  portal,
  pillars,
  heading,
  subtitle,
  signOutAction,
  isAdmin,
  showStaffAccess,
}: {
  portal: string;
  pillars: NavPillar[];
  heading: string;
  subtitle?: string;
  signOutAction: () => Promise<void>;
  isAdmin: boolean;
  showStaffAccess: boolean;
}) {
  const overview = <NavLink href={`/manage/${portal}`}>Overview</NavLink>;
  const dataCollection = (
    <>
      <NavLink href={`/manage/${portal}/registry`}>
        Participant registry
      </NavLink>
      <NavLink href={`/manage/${portal}/feedback-registry`}>
        Feedback registry
      </NavLink>
      <NavLink href={`/manage/${portal}/chii-registry`}>CHII database</NavLink>
      <NavLink href={`/manage/${portal}/import`}>Import a sheet</NavLink>
      {portal === "admin" && (
        <NavLink href={`/manage/${portal}/chii-registrations`}>CHII registrations</NavLink>
      )}
    </>
  );

  return (
    <nav
      aria-label="Pillars and interventions"
      className="flex h-full flex-col"
    >
      <div className="px-2.5 pb-4 pt-1">
        <div className="font-display text-xl font-semibold">{heading}</div>
        {subtitle && <div className="text-xs text-muted">{subtitle}</div>}
      </div>

      {portal === "admin" ? (
        <>
          <Section title="OVERVIEW">{overview}</Section>
          <Section title="DATA COLLECTION">{dataCollection}</Section>
        </>
      ) : (
        <>
          {overview}
          {dataCollection}
        </>
      )}

      {/* The pillar sections are shown in the pillar views only, not the MELA view. */}
      {portal !== "admin" && (
      <Section title="PILLAR TRACKER">
        {pillars.map(({ pillar, interventions }) => {
          const body = (
            <>
              {interventions.map((i) => (
                <NavLink
                  key={i.id}
                  href={`/manage/${portal}/interventions/${i.id}`}
                  count={i.sessionCount}
                >
                  <span
                    className={`inline-block h-2 w-2 flex-none rounded-full border-[1.5px] border-muted ${
                      i.type === "selective" ? "bg-muted" : ""
                    }`}
                    title={i.type}
                  />
                  {i.name}
                </NavLink>
              ))}
              {isAdmin && <AddInterventionDialog pillar={pillar} />}
            </>
          );
          const colour = (
            <span
              className="h-3.5 w-1 rounded-sm"
              style={{ background: PILLAR_COLOR[pillar] }}
            />
          );

          // The admin view can fold each pillar's interventions away. Pillar views always show them.
          if (portal !== "admin") {
            return (
              <div key={pillar}>
                <div className="flex items-center gap-2 px-2.5 pb-1.5 pt-4 text-xs font-semibold tracking-wider text-muted">
                  {colour}
                  {pillar}
                </div>
                {body}
              </div>
            );
          }
          return (
            <details key={pillar} open className="group">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-2.5 pb-1.5 pt-4 text-xs font-semibold tracking-wider text-muted hover:text-ink [&::-webkit-details-marker]:hidden">
                {colour}
                {pillar}
                <span
                  aria-hidden
                  className="ml-auto text-sm transition-transform group-open:rotate-90"
                >
                  ›
                </span>
              </summary>
              {body}
            </details>
          );
        })}
      </Section>
      )}

      <Section title="DATABASE">
        <NavLink href={`/manage/${portal}/data`}>Data for the dashboard</NavLink>
        {pillars.map(({ pillar }) => (
          <details key={pillar} className="group ml-1">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-2.5 py-1.5 text-sm font-semibold text-ink hover:text-accent [&::-webkit-details-marker]:hidden">
              <span className="h-3 w-1 rounded-sm" style={{ background: PILLAR_COLOR[pillar] }} />
              {pillar}
              <span aria-hidden className="ml-auto text-xs transition-transform group-open:rotate-90">
                ›
              </span>
            </summary>
            <div className="flex flex-col">
              <a
                href={`/api/workbooks/${pillar}?type=participants`}
                download
                className="px-2.5 py-1.5 pl-6 text-sm text-muted hover:bg-sunk hover:text-ink"
              >
                {pillar} Participant Consolidated Database
              </a>
              <a
                href={`/api/workbooks/${pillar}?type=feedback`}
                download
                className="px-2.5 py-1.5 pl-6 text-sm text-muted hover:bg-sunk hover:text-ink"
              >
                {pillar} Feedback Consolidated Database
              </a>
            </div>
          </details>
        ))}
      </Section>

      {showStaffAccess && (
        <Section title="ACCESS MANAGEMENT">
          <NavLink href={`/manage/${portal}/staff`}>Staff access</NavLink>
        </Section>
      )}

      <div className="mt-auto border-t border-line pt-4 text-sm">
        <Link
          href="/dashboard"
          className="block px-2.5 py-1.5 text-accent hover:underline"
        >
          Dashboard
        </Link>
        <form action={signOutAction}>
          <button type="submit" className="px-2.5 py-1.5 text-muted hover:text-ink">
            Sign out
          </button>
        </form>
      </div>
    </nav>
  );
}
