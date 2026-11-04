"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { BarChart3, Database, FolderOpen, Home, Layers, MessageSquareText, ShieldCheck, Upload, Users } from "lucide-react";
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
  HENT: "#7FA8F0",
  HEMP: "#4F8FE8",
  HECO: "#C7DBFF",
};

function NavLink({
  href,
  children,
  count,
  icon: Icon,
}: {
  href: string;
  children: React.ReactNode;
  count?: number;
  icon?: LucideIcon;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(href + "/");
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4F93E0] ${
        active
          ? "bg-white/15 font-semibold text-white before:absolute before:left-0 before:top-2 before:bottom-2 before:w-[3px] before:rounded-full before:bg-[#8FB0F5]"
          : "text-[#D8E4F3] hover:bg-white/10 hover:text-white"
      }`}
    >
      {Icon && (
        <span
          aria-hidden
          className={`flex h-7 w-7 flex-none items-center justify-center rounded-md ${
            active ? "bg-[#8FB0F5]/35 text-white" : "bg-white/10 text-[#BFD4F5]"
          }`}
        >
          <Icon size={15} />
        </span>
      )}
      <span className="sidebar-label">{children}</span>
      {count !== undefined && (
        <span
          className={`sidebar-label ml-auto rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
            active ? "bg-white text-[#102C5E]" : "bg-white/15 text-white"
          }`}
        >
          {count || 0}
        </span>
      )}
    </Link>
  );
}

// A sidebar group: an icon and a small-caps heading, folded open or shut.
function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon?: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <details open className="group">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-2.5 pb-2 pt-5 text-[11px] font-bold uppercase tracking-[0.12em] text-[#8FB0F5] hover:text-white [&::-webkit-details-marker]:hidden">
        {Icon && <Icon size={13} aria-hidden />}
        <span className="sidebar-label">{title}</span>
        <span aria-hidden className="sidebar-label ml-auto text-sm transition-transform group-open:rotate-90">
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
  const overview = (
    <NavLink href={`/manage/${portal}`} icon={Home}>
      Overview
    </NavLink>
  );
  const dataCollection = (
    <>
      <NavLink href={`/manage/${portal}/registry`} icon={Users}>
        CHII Participants
      </NavLink>
      <NavLink href={`/manage/${portal}/feedback-registry`} icon={MessageSquareText}>
        CHII Feedbacks
      </NavLink>
      <NavLink href={`/manage/${portal}/import`} icon={Upload}>Import a sheet</NavLink>
    </>
  );

  return (
    <nav
      aria-label="Pillars and interventions"
      className="flex h-full flex-col gap-0.5"
    >
      <div className="mb-2 rounded-xl bg-white/10 p-4 text-white ring-1 ring-white/15">
        <div className="sidebar-label font-display text-xl font-semibold">{heading}</div>
        {subtitle && <div className="sidebar-label mt-0.5 text-xs text-[#BFD4F5]">{subtitle}</div>}
      </div>

      {portal === "admin" ? (
        <>
          <Section title="OVERVIEW" icon={Home}>{overview}</Section>
          <Section title="DATA COLLECTION" icon={FolderOpen}>{dataCollection}</Section>
        </>
      ) : (
        <>
          {overview}
          {dataCollection}
        </>
      )}

      {/* The pillar sections are shown in the pillar views only, not the MELA view. */}
      {portal !== "admin" && (
      <Section title="PILLAR TRACKER" icon={Layers}>
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
                <div className="flex items-center gap-2 px-2.5 pb-1.5 pt-4 text-xs font-semibold tracking-wider text-[#8FB0F5]">
                  {colour}
                  <span className="sidebar-label">{pillar}</span>
                </div>
                {body}
              </div>
            );
          }
          return (
            <details key={pillar} open className="group">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-2.5 pb-1.5 pt-4 text-xs font-semibold tracking-wider text-[#8FB0F5] hover:text-white [&::-webkit-details-marker]:hidden">
                {colour}
                <span className="sidebar-label">{pillar}</span>
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

      <Section title="DATABASE" icon={Database}>
        <NavLink href={`/manage/${portal}/data`} icon={BarChart3}>Data for the dashboard</NavLink>
        <NavLink href={`/manage/${portal}/chii-registry`} icon={Database}>CHII database</NavLink>
        {pillars.map(({ pillar }) => (
          <details key={pillar} className="group ml-1">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-2.5 py-1.5 text-sm font-semibold text-white hover:text-[#BFD4F5] [&::-webkit-details-marker]:hidden">
              <span className="h-3 w-1 rounded-sm" style={{ background: PILLAR_COLOR[pillar] }} />
              <span className="sidebar-label">{pillar}</span>
              <span aria-hidden className="sidebar-label ml-auto text-xs transition-transform group-open:rotate-90">
                ›
              </span>
            </summary>
            <div className="flex flex-col">
              <a
                href={`/api/workbooks/${pillar}?type=participants`}
                download
                className="rounded-md px-2.5 py-1.5 pl-6 text-sm text-[#D8E4F3] hover:bg-white/10 hover:text-white"
              >
                <span className="sidebar-label">{pillar} Participant Consolidated Database</span>
              </a>
              <a
                href={`/api/workbooks/${pillar}?type=feedback`}
                download
                className="rounded-md px-2.5 py-1.5 pl-6 text-sm text-[#D8E4F3] hover:bg-white/10 hover:text-white"
              >
                <span className="sidebar-label">{pillar} Feedback Consolidated Database</span>
              </a>
            </div>
          </details>
        ))}
      </Section>

      {showStaffAccess && (
        <Section title="ACCESS MANAGEMENT" icon={ShieldCheck}>
          <NavLink href={`/manage/${portal}/staff`} icon={ShieldCheck}>Staff access</NavLink>
        </Section>
      )}

      <div className="mt-auto border-t border-white/15 pt-4 text-sm">
        <Link
          href="/dashboard"
          className="block rounded-md px-2.5 py-1.5 font-semibold text-white hover:bg-white/10"
        >
          <span className="sidebar-label">Dashboard</span>
        </Link>
        <form action={signOutAction}>
          <button type="submit" className="rounded-md px-2.5 py-1.5 text-[#D8E4F3] hover:bg-white/10 hover:text-white">
            <span className="sidebar-label">Sign out</span>
          </button>
        </form>
      </div>
    </nav>
  );
}
