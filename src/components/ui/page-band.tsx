import type { ReactNode } from "react";

// The navy band used at the top of every manager page. Description text inside it is shown in light blue.
export function PageBand({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <header className="flex flex-col gap-2 rounded-[16px] bg-[#102C5E] p-6 text-white shadow-[0_8px_24px_rgba(16,44,94,0.18)] [&>p]:max-w-2xl [&>p]:text-[15px] [&>p]:text-[#D8E4F3]">
      <h1 className="font-display text-[30px] font-semibold leading-tight">{title}</h1>
      {children}
    </header>
  );
}
