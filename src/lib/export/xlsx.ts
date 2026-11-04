import ExcelJS from "exceljs";

// One sheet: a bold header row (frozen, filterable), one row per record, and columns sized to their content.
export async function toXlsx(sheetName: string, columns: string[], rows: Record<string, unknown>[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(sheetName.slice(0, 31));
  sheet.columns = columns.map((c) => ({ header: c, key: c }));
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  for (const r of rows) {
    sheet.addRow(Object.fromEntries(columns.map((c) => [c, r[c] ?? null])));
  }
  columns.forEach((c, i) => {
    const longest = Math.max(c.length, ...rows.map((r) => String(r[c] ?? "").length));
    sheet.getColumn(i + 1).width = Math.min(Math.max(longest + 2, 10), 60);
  });
  if (rows.length > 0) sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  const out = await workbook.xlsx.writeBuffer();
  return Buffer.from(out);
}

export type SheetSpec = { name: string; columns: string[]; headers: string[]; rows: Record<string, unknown>[] };

// Several sheets in one workbook. Each sheet has a bold, frozen, filterable header row.
export async function toWorkbook(sheets: SheetSpec[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  for (const spec of sheets) {
    const sheet = workbook.addWorksheet(spec.name.slice(0, 31));
    sheet.columns = spec.columns.map((c, i) => ({ header: spec.headers[i], key: c }));
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    for (const r of spec.rows) {
      sheet.addRow(Object.fromEntries(spec.columns.map((c) => [c, r[c] ?? null])));
    }
    spec.columns.forEach((c, i) => {
      const longest = Math.max(spec.headers[i].length, ...spec.rows.map((r) => String(r[c] ?? "").length));
      sheet.getColumn(i + 1).width = Math.min(Math.max(longest + 2, 10), 60);
    });
    if (spec.rows.length > 0) sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: spec.columns.length } };
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
