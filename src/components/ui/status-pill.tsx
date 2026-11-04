import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Status pills: functional colours (green, amber, red, blue, grey), each with a light tint and dark text (WCAG AA).
const TONES = {
  neutral: "bg-[#EEF1F6] text-[#3B4658]",
  info: "bg-[#E6F0FC] text-[#1F4A94]",
  good: "bg-[#E3F4E8] text-[#1E6B37]",
  warn: "bg-[#FCF3E2] text-[#7A4E00]",
  bad: "bg-[#FDEBEC] text-[#9E2A33]",
} as const;

export type Tone = keyof typeof TONES;

export function StatusPill({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold", TONES[tone], className)}>{children}</span>;
}

// A dot for health: green, amber or red. Shape and text carry the meaning too, so colour is not the only signal.
const DOT = { good: "#16A34A", warn: "#E0A458", bad: "#DC2626" } as const;

export function HealthDot({ tone, label }: { tone: "good" | "warn" | "bad"; label?: string }) {
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className="inline-block h-2.5 w-2.5 rounded-full"
      style={{ background: DOT[tone] }}
    />
  );
}
