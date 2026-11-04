import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

// A section heading with an icon in a blue tile, a title, a line saying what the section shows, and an optional count.
export function SectionTitle({
  icon: Icon,
  title,
  description,
  count,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  count?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[#E3E8F0] pb-3">
      <div className="flex items-center gap-3">
        <span aria-hidden className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-[#E6F0FC] text-[#14306B]">
          <Icon size={18} />
        </span>
        <div>
          <h2 className="font-display text-xl font-semibold text-[#102C5E]">{title}</h2>
          {description && <p className="text-sm text-[#5E6C84]">{description}</p>}
        </div>
      </div>
      {count !== undefined && (
        <span className="rounded-full bg-[#102C5E] px-3 py-1 text-sm font-semibold tabular-nums text-white">{count}</span>
      )}
    </div>
  );
}
