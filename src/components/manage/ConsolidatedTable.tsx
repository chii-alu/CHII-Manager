"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Filter } from "lucide-react";
import {
  BLANK_LABEL,
  cellText,
  describeFilters,
  distinctValues,
  filterRows,
  isFiltered,
  NO_FILTERS,
  sortRows,
  type SheetData,
  type SortState,
  type TableFilters,
} from "@/lib/database/table";

export type ExportFormat = "xlsx" | "csv" | "pdf";
const FORMATS: { value: ExportFormat; label: string; hint: string }[] = [
  { value: "xlsx", label: "Excel (.xlsx)", hint: "Keeps the sheet, headings and filters" },
  { value: "csv", label: "CSV (.csv)", hint: "Plain text, opens in any spreadsheet" },
  { value: "pdf", label: "PDF (.pdf)", hint: "Landscape pages for reading or printing" },
];

// Rows drawn on screen, and values listed in a filter menu. Larger lists stay fast; search or filter to reach the rest.
const DRAW_LIMIT = 500;
const LIST_LIMIT = 300;

type Menu = { column: string; top: number; left: number; draft: Set<string>; search: string };

// The database as a table, one tab per sheet of the consolidated workbook. Each heading has an Excel-style filter
// and sort menu. Downloads send the rows on screen (or the whole sheet) to the server to be written as the chosen format.
export function ConsolidatedTable({
  pillar,
  type,
  sheets,
}: {
  pillar: string;
  type: "participants" | "feedback";
  sheets: SheetData[];
}) {
  const [active, setActive] = useState(0);
  const [filters, setFilters] = useState<TableFilters>(NO_FILTERS);
  const [sort, setSort] = useState<SortState>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [format, setFormat] = useState<ExportFormat>("xlsx");
  const [scope, setScope] = useState<"filtered" | "all">("filtered");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const sheet = sheets[active];
  const visible = useMemo(() => sortRows(filterRows(sheet.rows, sheet.columns, filters), sort), [sheet, filters, sort]);

  // The values a column's menu offers: those in rows that pass the other columns' filters, as Excel does.
  const valuesFor = (column: string) => {
    const others: TableFilters = { search: filters.search, columns: Object.fromEntries(Object.entries(filters.columns).filter(([k]) => k !== column)) };
    return distinctValues(filterRows(sheet.rows, sheet.columns, others), column);
  };

  const chooseSheet = (index: number) => {
    setActive(index);
    setFilters(NO_FILTERS);
    setSort(null);
    setMenu(null);
    setError(null);
  };

  // Close the filter menu on a click outside it, on Escape, or when the page moves.
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    const close = () => setMenu(null);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [menu]);

  const openMenu = (column: string, button: HTMLElement) => {
    if (menu?.column === column) return setMenu(null);
    const rect = button.getBoundingClientRect();
    const ticked = filters.columns[column];
    const draft = ticked ? new Set(ticked) : new Set(valuesFor(column).map((v) => v.value));
    setMenu({ column, top: rect.bottom + 4, left: Math.max(8, Math.min(rect.left, window.innerWidth - 300)), draft, search: "" });
  };

  // Applies the ticked values. Ticking everything is the same as no filter.
  const applyMenu = () => {
    if (!menu) return;
    const all = valuesFor(menu.column).map((v) => v.value);
    const everything = all.every((v) => menu.draft.has(v));
    setFilters((f) => {
      const columns = { ...f.columns };
      if (everything) delete columns[menu.column];
      else columns[menu.column] = new Set(menu.draft);
      return { ...f, columns };
    });
    setMenu(null);
  };

  const clearColumn = (column: string) => {
    setFilters((f) => {
      const columns = { ...f.columns };
      delete columns[column];
      return { ...f, columns };
    });
    setMenu(null);
  };

  const download = async () => {
    setBusy(true);
    setError(null);
    const useFiltered = scope === "filtered";
    const headingOf = Object.fromEntries(sheet.columns.map((c, i) => [c, sheet.headers[i]]));
    try {
      const response = await fetch("/api/database/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pillar,
          type,
          sheet: sheet.name,
          format,
          scope,
          columns: sheet.columns,
          headers: sheet.headers,
          rows: useFiltered ? visible : sheet.rows,
          filters: useFiltered ? describeFilters(filters, headingOf) : {},
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? "The download could not be made.");
      }
      const name = /filename="([^"]+)"/.exec(response.headers.get("content-disposition") ?? "")?.[1] ?? `${pillar}-${type}.${format}`;
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setPanelOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The download could not be made.");
    } finally {
      setBusy(false);
    }
  };

  const menuValues = menu ? valuesFor(menu.column) : [];
  const menuShown = menu
    ? menuValues.filter((v) => (v.value === "" ? BLANK_LABEL : v.value).toLowerCase().includes(menu.search.trim().toLowerCase()))
    : [];
  const shownList = menuShown.slice(0, LIST_LIMIT);
  const allShownTicked = menu !== null && menuShown.length > 0 && menuShown.every((v) => menu.draft.has(v.value));
  const someShownTicked = menu !== null && menuShown.some((v) => menu.draft.has(v.value));

  const toggleShown = () => {
    if (!menu) return;
    setMenu({
      ...menu,
      draft: new Set(allShownTicked ? [...menu.draft].filter((v) => !menuShown.some((s) => s.value === v)) : [...menu.draft, ...menuShown.map((s) => s.value)]),
    });
  };

  const toggleValue = (value: string) => {
    if (!menu) return;
    const draft = new Set(menu.draft);
    if (draft.has(value)) draft.delete(value);
    else draft.add(value);
    setMenu({ ...menu, draft });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Sheet tabs, as in the workbook. */}
      <div role="tablist" aria-label="Sheets" className="flex flex-wrap gap-2">
        {sheets.map((s, i) => (
          <button
            key={s.name}
            type="button"
            role="tab"
            aria-selected={i === active}
            onClick={() => chooseSheet(i)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4F93E0] ${
              i === active ? "bg-[#102C5E] text-white" : "border border-[#C9D3E3] bg-white text-[#14306B] hover:border-[#14306B]"
            }`}
          >
            {s.name}
            <span className={`ml-2 text-xs tabular-nums ${i === active ? "text-[#BFD4F5]" : "text-[#5E6C84]"}`}>{s.rows.length}</span>
          </button>
        ))}
      </div>

      {/* Search, clear, count and download. Column filters sit in the headings. */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          placeholder="Search every column"
          aria-label="Search every column"
          className="min-w-[220px] flex-1 rounded-lg border border-[#C9D3E3] bg-white px-3 py-2 text-sm text-[#172B4D] placeholder:text-[#8A97AD] focus:border-[#4F93E0] focus:outline-none"
        />
        {isFiltered(filters) && (
          <button type="button" onClick={() => setFilters(NO_FILTERS)} className="rounded-lg px-3 py-2 text-sm font-semibold text-[#14306B] underline-offset-2 hover:underline">
            Clear all filters
          </button>
        )}
        <p className="text-sm text-[#5E6C84]" aria-live="polite">
          Showing <span className="font-semibold text-[#172B4D] tabular-nums">{visible.length}</span> of{" "}
          <span className="tabular-nums">{sheet.rows.length}</span> records
        </p>
        <button
          type="button"
          onClick={() => setPanelOpen((v) => !v)}
          aria-expanded={panelOpen}
          className="ml-auto rounded-lg bg-[#102C5E] px-4 py-2 text-sm font-semibold text-white hover:bg-[#14306B]"
        >
          Download
        </button>
      </div>

      {panelOpen && (
        <div className="rounded-[14px] border border-[#E3E8F0] bg-white p-5 shadow-[0_8px_24px_rgba(16,44,94,0.10)]">
          <div className="grid gap-6 md:grid-cols-2">
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-xs font-bold uppercase tracking-[0.1em] text-[#5E6C84]">File format</legend>
              {FORMATS.map((f) => (
                <label key={f.value} className="flex cursor-pointer items-start gap-3 rounded-lg border border-[#E3E8F0] p-3 has-[:checked]:border-[#14306B] has-[:checked]:bg-[#F5F7FA]">
                  <input type="radio" name="format" value={f.value} checked={format === f.value} onChange={() => setFormat(f.value)} className="mt-1 accent-[#14306B]" />
                  <span>
                    <span className="block text-sm font-semibold text-[#172B4D]">{f.label}</span>
                    <span className="block text-xs text-[#5E6C84]">{f.hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-xs font-bold uppercase tracking-[0.1em] text-[#5E6C84]">What to include</legend>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[#E3E8F0] p-3 has-[:checked]:border-[#14306B] has-[:checked]:bg-[#F5F7FA]">
                <input type="radio" name="scope" value="filtered" checked={scope === "filtered"} onChange={() => setScope("filtered")} className="mt-1 accent-[#14306B]" />
                <span>
                  <span className="block text-sm font-semibold text-[#172B4D]">Records on screen ({visible.length})</span>
                  <span className="block text-xs text-[#5E6C84]">This sheet, with the search, filters and sort applied</span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[#E3E8F0] p-3 has-[:checked]:border-[#14306B] has-[:checked]:bg-[#F5F7FA]">
                <input type="radio" name="scope" value="all" checked={scope === "all"} onChange={() => setScope("all")} className="mt-1 accent-[#14306B]" />
                <span>
                  <span className="block text-sm font-semibold text-[#172B4D]">Whole sheet ({sheet.rows.length})</span>
                  <span className="block text-xs text-[#5E6C84]">Every record on this sheet, ignoring filters</span>
                </span>
              </label>
            </fieldset>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={download}
              disabled={busy || (scope === "filtered" && visible.length === 0)}
              className="rounded-lg bg-[#102C5E] px-5 py-2 text-sm font-semibold text-white hover:bg-[#14306B] disabled:opacity-50"
            >
              {busy ? "Preparing…" : `Download ${format.toUpperCase()}`}
            </button>
            <button type="button" onClick={() => setPanelOpen(false)} className="rounded-lg px-3 py-2 text-sm font-semibold text-[#14306B] hover:underline">
              Cancel
            </button>
            {error && <p className="text-sm text-[#A4262C]">{error}</p>}
          </div>
        </div>
      )}

      {/* The table. Each heading has a filter button, like an Excel header. */}
      <div className="max-h-[70vh] overflow-auto rounded-[14px] border border-[#E3E8F0] bg-white">
        <table className="w-max min-w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#102C5E] text-center text-xs font-semibold text-white">
              {sheet.columns.map((c, i) => {
                const filtered = filters.columns[c] !== undefined;
                const sorted = sort?.column === c ? sort.direction : null;
                return (
                  <th key={c} aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none"} className="whitespace-nowrap px-3 py-2.5 font-semibold">
                    <span className="inline-flex items-center justify-center gap-2">
                      {sheet.headers[i]}
                      {sorted && <span aria-hidden>{sorted === "asc" ? "▲" : "▼"}</span>}
                      <button
                        type="button"
                        onClick={(e) => openMenu(c, e.currentTarget)}
                        aria-label={`Filter and sort ${sheet.headers[i]}`}
                        aria-haspopup="dialog"
                        aria-expanded={menu?.column === c}
                        className={`grid h-5 w-5 place-items-center rounded ${filtered ? "bg-white text-[#102C5E]" : "bg-white/15 text-white hover:bg-white/25"}`}
                      >
                        <Filter size={11} aria-hidden />
                      </button>
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={Math.max(sheet.columns.length, 1)} className="px-4 py-8 text-center text-[#5E6C84]">
                  {sheet.rows.length === 0 ? "No records on this sheet yet." : "No records match these filters."}
                </td>
              </tr>
            ) : (
              visible.slice(0, DRAW_LIMIT).map((r, n) => (
                <tr key={n} className="border-t border-[#E3E8F0] align-top hover:bg-[#F5F7FA]">
                  {sheet.columns.map((c) => {
                    const text = cellText(r[c]);
                    return (
                      <td key={c} title={text} className="max-w-xs truncate whitespace-nowrap px-3 py-2 text-[#172B4D]">
                        {text}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {visible.length > DRAW_LIMIT && (
        <p className="text-sm text-[#5E6C84]">
          Showing the first {DRAW_LIMIT} of {visible.length} records. Filter the table or download to see the rest.
        </p>
      )}

      {/* The Excel-style menu for one column: sort, clear, search the values, tick the values to keep. */}
      {menu && (
        <div
          ref={menuRef}
          role="dialog"
          aria-label={`Filter ${sheet.headers[sheet.columns.indexOf(menu.column)]}`}
          style={{ top: menu.top, left: menu.left }}
          className="fixed z-50 w-72 rounded-[10px] border border-[#C9D3E3] bg-white text-sm text-[#172B4D] shadow-[0_12px_32px_rgba(16,44,94,0.22)]"
        >
          <div className="flex flex-col border-b border-[#E3E8F0] py-1">
            <button type="button" onClick={() => { setSort({ column: menu.column, direction: "asc" }); setMenu(null); }} className="px-3 py-1.5 text-left hover:bg-[#F5F7FA]">
              Sort A to Z
            </button>
            <button type="button" onClick={() => { setSort({ column: menu.column, direction: "desc" }); setMenu(null); }} className="px-3 py-1.5 text-left hover:bg-[#F5F7FA]">
              Sort Z to A
            </button>
            {sort?.column === menu.column && (
              <button type="button" onClick={() => { setSort(null); setMenu(null); }} className="px-3 py-1.5 text-left hover:bg-[#F5F7FA]">
                Remove sort
              </button>
            )}
            {filters.columns[menu.column] !== undefined && (
              <button type="button" onClick={() => clearColumn(menu.column)} className="px-3 py-1.5 text-left hover:bg-[#F5F7FA]">
                Clear filter
              </button>
            )}
          </div>
          <div className="flex flex-col gap-2 p-3">
            <input
              type="search"
              value={menu.search}
              onChange={(e) => setMenu({ ...menu, search: e.target.value })}
              placeholder="Search values"
              aria-label="Search values"
              className="rounded-md border border-[#C9D3E3] px-2 py-1.5 text-sm focus:border-[#4F93E0] focus:outline-none"
            />
            <label className="flex items-center gap-2 border-b border-[#E3E8F0] pb-2 font-semibold">
              <input
                type="checkbox"
                checked={allShownTicked}
                ref={(el) => {
                  if (el) el.indeterminate = !allShownTicked && someShownTicked;
                }}
                onChange={toggleShown}
                disabled={menuShown.length === 0}
                className="accent-[#14306B]"
              />
              (Select all)
            </label>
            <div className="max-h-64 overflow-auto">
              {shownList.length === 0 && <p className="py-2 text-[#5E6C84]">No values match.</p>}
              {shownList.map((v) => (
                <label key={v.value} className="flex cursor-pointer items-center gap-2 py-1">
                  <input type="checkbox" checked={menu.draft.has(v.value)} onChange={() => toggleValue(v.value)} className="accent-[#14306B]" />
                  <span className={`flex-1 truncate ${v.value === "" ? "italic text-[#5E6C84]" : ""}`}>{v.value === "" ? BLANK_LABEL : v.value}</span>
                  <span className="text-xs tabular-nums text-[#5E6C84]">{v.count}</span>
                </label>
              ))}
              {menuShown.length > LIST_LIMIT && <p className="pt-1 text-xs text-[#5E6C84]">Showing {LIST_LIMIT} of {menuShown.length}. Search to narrow the list.</p>}
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-[#E3E8F0] p-3">
            <button type="button" onClick={() => setMenu(null)} className="rounded-lg px-3 py-1.5 font-semibold text-[#14306B] hover:underline">
              Cancel
            </button>
            <button type="button" onClick={applyMenu} className="rounded-lg bg-[#102C5E] px-4 py-1.5 font-semibold text-white hover:bg-[#14306B]">
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
