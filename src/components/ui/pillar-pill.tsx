import { cn } from "@/lib/utils";

// Each pillar has one blue shade, used for its chip, its card accent and its sidebar marker.
export const PILLAR_COLOUR: Record<string, { bar: string; chip: string; text: string }> = {
  HENT: { bar: "#2A5FB0", chip: "#E3ECF8", text: "#1F4A94" },
  HEMP: { bar: "#4F93E0", chip: "#E6F0FC", text: "#2D6DB8" },
  HECO: { bar: "#0B2145", chip: "#E4E9F2", text: "#0B2145" },
};

export function PillarPill({ pillar, className }: { pillar: string; className?: string }) {
  const s = PILLAR_COLOUR[pillar] ?? { chip: "#E4E9F2", text: "#102C5E" };
  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold", className)} style={{ background: s.chip, color: s.text }}>
      {pillar}
    </span>
  );
}
