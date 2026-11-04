import Link from "next/link";
import type { ReactNode } from "react";

// Every page: a title, a one-line description, optional breadcrumbs, and the primary action on the right.
export function PageHeader({
  title,
  description,
  action,
  crumbs,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  crumbs?: { label: string; href?: string }[];
}) {
  return (
    <header className="flex flex-col gap-3">
      {crumbs && crumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-sm text-[#5E6C84]">
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <span aria-hidden>/</span>}
              {c.href ? (
                <Link href={c.href} className="text-[#14306B] hover:underline">
                  {c.label}
                </Link>
              ) : (
                <span>{c.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[28px] font-semibold leading-tight text-[#102C5E]">{title}</h1>
          {description && <p className="mt-2 max-w-2xl text-[15px] text-[#5E6C84]">{description}</p>}
        </div>
        {action}
      </div>
    </header>
  );
}
