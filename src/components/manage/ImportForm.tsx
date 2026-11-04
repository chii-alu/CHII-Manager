"use client";

import { useState } from "react";
import { btnPri, card, input, label } from "@/components/ui/styles";

type Result = {
  kind: string;
  total: number;
  valid: number;
  duplicates: number;
  matched: number;
  new: number;
  invalid: { row: number; message: string }[];
  mapping: Record<string, string>;
  headers: string[];
  targets: { key: string; label: string }[];
  unmappedHeaders: string[];
  sample: Record<string, string | null>[];
};

export function ImportForm({ portal, interventions }: { portal: string; interventions: { id: string; name: string; pillar: string }[] }) {
  const [file, setFile] = useState<File | null>(null);
  const [interventionId, setInterventionId] = useState(interventions[0]?.id ?? "");
  const [kind, setKind] = useState<"participants" | "feedback">("participants");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pillar = interventions.find((i) => i.id === interventionId)?.pillar ?? portal.toUpperCase();

  const run = async (mapping?: Record<string, string>) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    const body = new FormData();
    body.append("file", file);
    body.append("kind", kind);
    body.append("interventionId", interventionId);
    if (mapping) body.append("mapping", JSON.stringify(mapping));
    const res = await fetch(`/api/import/${pillar}`, { method: "POST", body });
    const json = await res.json().catch(() => ({ ok: false, error: "Something went wrong." }));
    setBusy(false);
    if (!res.ok || !json.ok) {
      setResult(null);
      setError(json.error ?? "Something went wrong.");
      return;
    }
    setResult(json.data as Result);
  };

  return (
    <div className="flex flex-col gap-6">
      <form
        className={`${card} grid gap-3 sm:grid-cols-3`}
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        <label className={label}>
          Intervention
          <select className={input} value={interventionId} onChange={(e) => setInterventionId(e.target.value)}>
            {interventions.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Sheet is
          <select className={input} value={kind} onChange={(e) => setKind(e.target.value as "participants" | "feedback")}>
            <option value="participants">Registrations (participants)</option>
            <option value="feedback">Feedback</option>
          </select>
        </label>
        <label className={label}>
          File (CSV or XLSX)
          <input
            type="file"
            accept=".csv,.xlsx"
            className={input}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <div className="sm:col-span-3">
          <button type="submit" className={btnPri} disabled={!file || busy || !interventionId}>
            {busy ? "Checking…" : "Run dry run"}
          </button>
        </div>
      </form>

      {error && (
        <p role="alert" className="rounded-md bg-bad-soft p-3 text-sm text-bad-ink">
          {error}
        </p>
      )}

      {result && (
        <div className="flex flex-col gap-5">
          <div className={`${card} grid grid-cols-2 gap-3 text-sm sm:grid-cols-5`}>
            <Stat value={result.total} label="rows in the sheet" />
            <Stat value={result.valid} label="ready to import" />
            <Stat value={result.total - result.valid} label="need attention" />
            <Stat value={result.matched} label="people already on record" />
            <Stat value={result.new} label="new people" />
          </div>
          <p className="text-sm text-muted">{result.duplicates} repeated email{result.duplicates === 1 ? "" : "s"} in the sheet (kept).</p>

          <section className={`${card} flex flex-col gap-3`}>
            <h2 className="font-display text-lg font-semibold">Column mapping</h2>
            <p className="text-sm text-muted">Each sheet column is matched to a field. Change any that are wrong, then run the dry run again.</p>
            <MappingEditor result={result} onRerun={run} />
          </section>

          {result.invalid.length > 0 && (
            <section className={`${card} flex flex-col gap-2`}>
              <h2 className="font-display text-lg font-semibold">Rows that need attention</h2>
              <ul className="flex flex-col gap-1 text-sm">
                {result.invalid.map((i) => (
                  <li key={i.row}>
                    Row {i.row}: {i.message}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {result.sample.length > 0 && (
            <section className={`${card} flex flex-col gap-2 overflow-x-auto`}>
              <h2 className="font-display text-lg font-semibold">First rows as they would be imported</h2>
              <table className="w-full border-collapse text-sm">
                <thead className="bg-brand text-left text-xs font-semibold text-on-accent">
                  <tr>
                    {Object.keys(result.sample[0]).map((k) => (
                      <th key={k} className="px-3 py-2">{result.targets.find((t) => t.key === k)?.label ?? k}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.sample.map((r, i) => (
                    <tr key={i} className="border-t border-line">
                      {Object.keys(result.sample[0]).map((k) => (
                        <td key={k} className="px-3 py-2">{r[k] ?? "—"}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <p className="text-sm text-muted">Committing the import is the next step. Nothing has been saved yet.</p>
        </div>
      )}
    </div>
  );
}

function MappingEditor({ result, onRerun }: { result: Result; onRerun: (mapping: Record<string, string>) => void }) {
  const [mapping, setMapping] = useState<Record<string, string>>(result.mapping);
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-2 sm:grid-cols-2">
        {result.headers.map((h) => (
          <label key={h} className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">{h || "(no header)"}</span>
            <select className={input} value={mapping[h] ?? "ignore"} onChange={(e) => setMapping({ ...mapping, [h]: e.target.value })}>
              <option value="ignore">Do not import</option>
              {result.targets.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <div>
        <button type="button" className={btnPri} onClick={() => onRerun(mapping)}>
          Run dry run with this mapping
        </button>
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="font-display text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}
