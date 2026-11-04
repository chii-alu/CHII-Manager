import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { toXlsx } from "./xlsx";

describe("toXlsx", () => {
  it("writes a sheet with the headers and every row, and reads back the same", async () => {
    const buffer = await toXlsx("Participants", ["chii_id", "cohort", "nps"], [
      { chii_id: "CHII-000001", cohort: "Startup Finance 2026", nps: 9 },
      { chii_id: "CHII-000002", cohort: null, nps: 4 },
    ]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as never);
    const sheet = wb.getWorksheet("Participants");
    expect(sheet).toBeDefined();
    expect(sheet!.getRow(1).values).toEqual([undefined, "chii_id", "cohort", "nps"]);
    expect(sheet!.rowCount).toBe(3);
    expect(sheet!.getRow(2).getCell(2).value).toBe("Startup Finance 2026");
  });

  it("keeps the sheet name within Excel's 31-character limit", async () => {
    const buffer = await toXlsx("A very long sheet name that goes past thirty one characters", ["a"], []);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as never);
    expect(wb.worksheets[0].name.length).toBeLessThanOrEqual(31);
  });
});
