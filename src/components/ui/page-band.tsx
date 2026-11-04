import type { ReactNode } from "react";

// The navy band used at the top of every manager page. Description text inside it is shown in light blue.
// An optional aside sits in the right-hand corner (for example a total).
export function PageBand({ title, children, aside }: { title: ReactNode; children?: ReactNode; aside?: ReactNode }) {
  return (
    <header className="flex flex-col gap-4 rounded-[16px] bg-[#102C5E] p-6 text-white shadow-[0_8px_24px_rgba(16,44,94,0.18)] md:flex-row md:items-start md:justify-between [&_p]:max-w-2xl [&_p]:text-[15px] [&_p]:text-[#D8E4F3]">
      <div className="flex min-w-0 flex-col gap-2">
        <h1 className="font-display text-[30px] font-semibold leading-tight">{title}</h1>
        {children}
      </div>
      {aside && <div className="flex-none">{aside}</div>}
    </header>
  );
}
