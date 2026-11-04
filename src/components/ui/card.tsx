import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Cards: white surface, 14px radius, soft shadow. An optional top accent shows the pillar colour.
export function Card({ children, className, accent }: { children: ReactNode; className?: string; accent?: string }) {
  return (
    <div
      className={cn("rounded-[14px] border border-[#E3E8F0] bg-white p-5 shadow-[0_1px_2px_rgba(16,44,94,0.06)]", className)}
      style={accent ? { borderTop: `4px solid ${accent}` } : undefined}
    >
      {children}
    </div>
  );
}
