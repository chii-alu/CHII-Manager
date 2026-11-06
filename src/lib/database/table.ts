// Filtering, search and sorting for a consolidated database sheet. Pure functions, so the table component and tests share them.
// Column filters work like Excel's: each filtered column keeps the set of values that are ticked, and a row shows only if
// its value is ticked in every filtered column.

export type SheetData = { name: string; columns: string[]; headers: string[]; rows: Record<string, unknown>[] };

// Ticked values per column. A column with no entry is not filtered.
export type TableFilters = { search: string; columns: Record<string, Set<string>> };

export const NO_FILTERS: TableFilters = { search: "", columns: {} };

export const BLANK_LABEL = "(Blanks)";

// How a value reads in the table and in an export. Lists and objects are shown as JSON, like the workbook files.
export function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export type DistinctValue = { value: string; count: number };

// Every distinct value in a column with how many rows have it, in natural order. Blanks come last, as in Excel.
export function distinctValues(rows: Record<string, unknown>[], column: string): DistinctValue[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const v = cellText(r[column]);
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const values = [...counts.entries()].map(([value, count]) => ({ value, count }));
  return values.sort((a, b) => {
    if (a.value === "" || b.value === "") return a.value === "" ? 1 : b.value === "" ? -1 : 0;
    return a.value.localeCompare(b.value, undefined, { numeric: true, sensitivity: "base" });
  });
}

export function isFiltered(filters: TableFilters) {
  return filters.search.trim() !== "" || Object.keys(filters.columns).length > 0;
}

export function filterRows(rows: Record<string, unknown>[], columns: string[], filters: TableFilters) {
  const search = filters.search.trim().toLowerCase();
  const active = Object.entries(filters.columns).filter(([k]) => columns.includes(k));
  return rows.filter((r) => {
    if (search && !columns.some((c) => cellText(r[c]).toLowerCase().includes(search))) return false;
    return active.every(([k, allowed]) => allowed.has(cellText(r[k])));
  });
}

export type SortState = { column: string; direction: "asc" | "desc" } | null;

// Numbers sort as numbers, everything else as text. Blank values always go last.
export function sortRows(rows: Record<string, unknown>[], sort: SortState) {
  if (!sort) return rows;
  const dir = sort.direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = a[sort.column];
    const y = b[sort.column];
    const xBlank = cellText(x) === "";
    const yBlank = cellText(y) === "";
    if (xBlank || yBlank) return xBlank === yBlank ? 0 : xBlank ? 1 : -1;
    if (typeof x === "number" && typeof y === "number") return (x - y) * dir;
    return cellText(x).localeCompare(cellText(y), undefined, { numeric: true, sensitivity: "base" }) * dir;
  });
}

// The filters as plain text, kept in the export log so a file can be traced back to what was on screen.
export function describeFilters(filters: TableFilters, headers: Record<string, string>): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  if (filters.search.trim()) out.search = filters.search.trim();
  for (const [k, allowed] of Object.entries(filters.columns)) {
    out[headers[k] ?? k] = [...allowed].map((v) => (v === "" ? BLANK_LABEL : v)).join("; ");
  }
  return out;
}
