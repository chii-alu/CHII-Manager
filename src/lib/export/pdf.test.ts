import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { toPdf } from "./pdf";

describe("toPdf", () => {
  it("writes a PDF with one page for a short sheet", async () => {
    const bytes = await toPdf({
      title: "HENT Consolidated Participants",
      subtitle: "All interventions",
      columns: ["chii_id", "intervention"],
      headers: ["CHII ID", "Intervention"],
      rows: [{ chii_id: "CHII-000001", intervention: "SIE" }],
    });
    expect(new TextDecoder().decode(bytes.subarray(0, 4))).toBe("%PDF");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it("splits a wide sheet into more pages, and copes with characters outside the standard font", async () => {
    const columns = Array.from({ length: 40 }, (_, i) => `col_${i}`);
    const headers = columns.map((c) => `Heading ${c}`);
    const rows = [{ col_0: "Kigali ‘quoted’ — ünïcode ✓", col_1: "line\nbreak" }];
    const bytes = await toPdf({ title: "Wide", subtitle: "Test", columns, headers, rows });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });

  it("still writes a file when there are no records", async () => {
    const bytes = await toPdf({ title: "Empty", subtitle: "None", columns: ["a"], headers: ["A"], rows: [] });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });
});
