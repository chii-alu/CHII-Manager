import { describe, expect, it } from "vitest";
import { allowedColumns, fileName, RESTRICTED_COLUMNS } from "./restricted";

describe("restricted columns", () => {
  const keys = ["chii_id", "email", "full_name", "intervention", "financial_standing"];
  const headers = ["CHII ID", "Email", "Names", "Intervention", "Financial Standing"];

  it("the data owner gets every column", () => {
    const r = allowedColumns(keys, headers, true);
    expect(r.keys).toEqual(keys);
    expect(r.removed).toBe(false);
  });

  it("other staff get the file without the restricted columns, and it is marked", () => {
    const r = allowedColumns(keys, headers, false);
    expect(r.keys).toEqual(["chii_id", "intervention"]);
    expect(r.headers).toEqual(["CHII ID", "Intervention"]);
    expect(r.removed).toBe(true);
    expect(fileName("HENT Consolidated Participants", "xlsx", true)).toBe("HENT Consolidated Participants - de-identified.xlsx");
    expect(fileName("HENT Consolidated Participants", "xlsx", false)).toBe("HENT Consolidated Participants.xlsx");
  });

  it("covers the email, names, student ID and standing columns", () => {
    for (const c of ["email", "full_name", "student_id", "financial_standing", "academic_standing", "disciplinary_standing"]) {
      expect(RESTRICTED_COLUMNS.has(c)).toBe(true);
    }
  });
});
