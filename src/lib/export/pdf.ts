import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { cellText } from "@/lib/database/table";

export type PdfTable = {
  title: string;
  subtitle: string;
  columns: string[];
  headers: string[];
  rows: Record<string, unknown>[];
};

// A4 landscape. Wide sheets are split into column groups; each group runs down every page with its own headers.
const PAGE_W = 841.89;
const PAGE_H = 595.28;
const MARGIN = 28;
const FONT_SIZE = 7;
const ROW_H = 13;
const TITLE_H = 44;
const MIN_COL = 46;
const MAX_COL = 170;
const CHAR_W = 3.7;

// Characters the standard PDF fonts can draw. Anything else becomes "?", so odd characters cannot stop the export.
const safeText = (value: unknown) => cellText(value).replace(/[\r\n\t]+/g, " ").replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");

function fit(text: string, font: PDFFont, width: number) {
  if (font.widthOfTextAtSize(text, FONT_SIZE) <= width) return text;
  let out = text;
  while (out.length > 0 && font.widthOfTextAtSize(`${out}...`, FONT_SIZE) > width) out = out.slice(0, -1);
  return `${out}...`;
}

// Groups of columns whose widths fit one page across.
function columnGroups(table: PdfTable, usable: number) {
  const widths = table.columns.map((c, i) => {
    const longest = Math.max(table.headers[i].length, ...table.rows.map((r) => safeText(r[c]).length));
    return Math.min(Math.max(longest * CHAR_W + 10, MIN_COL), MAX_COL);
  });
  const groups: { index: number; width: number }[][] = [];
  let current: { index: number; width: number }[] = [];
  let used = 0;
  widths.forEach((width, index) => {
    if (current.length > 0 && used + width > usable) {
      groups.push(current);
      current = [];
      used = 0;
    }
    current.push({ index, width });
    used += width;
  });
  if (current.length > 0) groups.push(current);
  return groups;
}

// Writes the table as a PDF file and returns its bytes.
export async function toPdf(table: PdfTable): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(table.title);
  doc.setCreationDate(new Date());
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const navy = rgb(0.067, 0.173, 0.369);
  const ink = rgb(0.09, 0.17, 0.3);
  const line = rgb(0.85, 0.89, 0.94);
  const band = rgb(0.94, 0.96, 0.98);

  const usable = PAGE_W - MARGIN * 2;
  const groups = columnGroups(table, usable);
  const bodyTop = PAGE_H - MARGIN - TITLE_H;
  const rowsPerPage = Math.floor((bodyTop - MARGIN - ROW_H) / ROW_H);
  const pages = Math.max(1, Math.ceil(table.rows.length / rowsPerPage));

  for (const group of groups) {
    for (let p = 0; p < pages; p++) {
      const page: PDFPage = doc.addPage([PAGE_W, PAGE_H]);
      page.drawText(fit(safeText(table.title), bold, usable), { x: MARGIN, y: PAGE_H - MARGIN - 12, size: 11, font: bold, color: navy });
      const pageNote = `${table.subtitle}   Page ${p + 1} of ${pages}${groups.length > 1 ? `, columns ${group[0].index + 1}-${group[group.length - 1].index + 1} of ${table.columns.length}` : ""}`;
      page.drawText(fit(safeText(pageNote), regular, usable), { x: MARGIN, y: PAGE_H - MARGIN - 26, size: FONT_SIZE + 1, font: regular, color: ink });

      let y = bodyTop;
      // Header row.
      page.drawRectangle({ x: MARGIN, y: y - ROW_H, width: usable, height: ROW_H, color: navy });
      let x = MARGIN;
      for (const { index, width } of group) {
        page.drawText(fit(safeText(table.headers[index]), bold, width - 6), { x: x + 3, y: y - ROW_H + 4, size: FONT_SIZE, font: bold, color: rgb(1, 1, 1) });
        x += width;
      }
      y -= ROW_H;

      const slice = table.rows.slice(p * rowsPerPage, (p + 1) * rowsPerPage);
      if (table.rows.length === 0) {
        page.drawText("No records", { x: MARGIN + 3, y: y - ROW_H + 4, size: FONT_SIZE, font: regular, color: ink });
      }
      slice.forEach((row, n) => {
        if (n % 2 === 1) page.drawRectangle({ x: MARGIN, y: y - ROW_H, width: usable, height: ROW_H, color: band });
        let cx = MARGIN;
        for (const { index, width } of group) {
          const text = fit(safeText(row[table.columns[index]]), regular, width - 6);
          if (text) page.drawText(text, { x: cx + 3, y: y - ROW_H + 4, size: FONT_SIZE, font: regular, color: ink });
          cx += width;
        }
        page.drawLine({ start: { x: MARGIN, y: y - ROW_H }, end: { x: MARGIN + usable, y: y - ROW_H }, thickness: 0.5, color: line });
        y -= ROW_H;
      });
    }
  }

  return doc.save();
}
