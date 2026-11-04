// Matching sheet columns to fields, and checking each row. Pure functions, so the dry run can be tested without a database.

export type Target = { key: string; label: string; aliases?: string[] };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Suggests a field for each sheet column: an exact match on the field's label or key, then one of its aliases.
export function suggestMapping(headers: string[], targets: Target[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const h of headers) {
    const n = norm(h);
    const hit = targets.find((t) => norm(t.label) === n || norm(t.key) === n || (t.aliases ?? []).some((a) => norm(a) === n));
    mapping[h] = hit ? hit.key : "ignore";
  }
  return mapping;
}

export type Issue = { row: number; message: string };

export type Plan = {
  total: number;
  valid: number;
  invalid: Issue[];
  duplicates: number;
  rows: Record<string, string | null>[];
  unmappedHeaders: string[];
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Applies the mapping to each row, trims values, and checks it. Rows with no usable email are not imported.
// Emails repeated in the sheet are counted, and kept (the same name with different emails is a different person).
export function planImport(headers: string[], rows: string[][], mapping: Record<string, string>): Plan {
  const issues: Issue[] = [];
  const kept: Record<string, string | null>[] = [];
  const seen = new Map<string, number>();
  let duplicates = 0;

  rows.forEach((cells, index) => {
    const row: Record<string, string | null> = {};
    headers.forEach((h, col) => {
      const target = mapping[h];
      if (!target || target === "ignore") return;
      const value = (cells[col] ?? "").replace(/\s+/g, " ").trim();
      row[target] = value === "" ? null : value;
    });
    // Emails: spaces and line breaks removed, case kept as the sheet has it.
    for (const k of ["email", "student_email"]) {
      if (row[k]) row[k] = row[k]!.replace(/\s/g, "");
    }
    const number = index + 2; // the header is row 1
    if (!row.email) {
      issues.push({ row: number, message: "No email address" });
      return;
    }
    if (!EMAIL.test(row.email)) {
      issues.push({ row: number, message: `"${row.email}" is not a valid email address` });
      return;
    }
    const key = row.email.toLowerCase();
    if (seen.has(key)) duplicates++;
    seen.set(key, number);
    kept.push(row);
  });

  const unmappedHeaders = headers.filter((h) => !mapping[h] || mapping[h] === "ignore");
  return { total: rows.length, valid: kept.length, invalid: issues, duplicates, rows: kept, unmappedHeaders };
}
