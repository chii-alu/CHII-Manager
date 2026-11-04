"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PillarChip } from "./Chips";
import { input } from "@/components/ui/styles";
import { usePortal } from "./usePortal";

export type RegistryRow = {
  pid: string;
  name: string;
  email: string;
  gender: string | null;
  age: string | null;
  country: string | null;
  pillars: string[];
  sessions: number;
  attended: number;
};

export function RegistryTable({ rows }: { rows: RegistryRow[] }) {
  const portal = usePortal();
  const [q, setQ] = useState("");
  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) => `${r.name} ${r.email} ${r.pid} ${r.country ?? ""}`.toLowerCase().includes(term));
  }, [rows, q]);

  return (
    <div className="flex flex-col gap-4">
      <input
        type="search"
        className={`${input} max-w-sm`}
        placeholder="Search name, email, ID or country"
        aria-label="Search participants"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {rows.length === 0 ? (
        <div className="rounded-[10px] border border-line bg-surface p-6 text-center text-muted">No participants yet.</div>
      ) : (
        <div className="overflow-x-auto rounded-[10px] border border-line bg-surface">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-brand text-left text-xs font-semibold text-on-accent">
              <tr>
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Gender</th>
                <th className="px-3 py-2">Age</th>
                <th className="px-3 py-2">Country</th>
                <th className="px-3 py-2">Pillars</th>
                <th className="px-3 py-2 text-right">Sessions</th>
                <th className="px-3 py-2 text-right">Attended</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.pid} className="border-t border-line hover:bg-sunk">
                  <td className="px-3 py-2 font-mono text-xs">
                    <Link href={`/manage/${portal}/registry/${r.pid}`} className="font-semibold text-accent hover:underline">
                      {r.pid}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{r.name}</td>
                  <td className="px-3 py-2">{r.email}</td>
                  <td className="px-3 py-2">{r.gender ?? "—"}</td>
                  <td className="px-3 py-2">{r.age ?? "—"}</td>
                  <td className="px-3 py-2">{r.country ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span className="flex flex-wrap gap-1">
                      {r.pillars.map((p) => (
                        <PillarChip key={p} pillar={p} />
                      ))}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.sessions}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.attended}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {visible.length === 0 && <div className="p-6 text-center text-muted">No one matches “{q}”.</div>}
        </div>
      )}
    </div>
  );
}
