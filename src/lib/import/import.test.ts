import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv";
import { planImport, suggestMapping, type Target } from "./plan";

const targets: Target[] = [
  { key: "email", label: "Email", aliases: ["Email address", "Personal email"] },
  { key: "full_name", label: "Names", aliases: ["Full name"] },
  { key: "gender_identity", label: "Gender Identity" },
  { key: "relevance", label: "Programme Relevance" },
];

describe("parseCsv", () => {
  it("reads quoted cells with commas and line breaks, and CRLF endings", () => {
    const rows = parseCsv('name,comment\r\n"Aline, U",\"Line one\nline two\"\r\nJean,"say ""hi"""\r\n');
    expect(rows).toEqual([
      ["name", "comment"],
      ["Aline, U", "Line one\nline two"],
      ["Jean", 'say "hi"'],
    ]);
  });

  it("drops blank lines", () => {
    expect(parseCsv("a,b\n\n,\nc,d\n")).toEqual([["a", "b"], ["c", "d"]]);
  });
});

describe("suggestMapping", () => {
  it("matches a column by its label, key or alias, ignoring case and punctuation", () => {
    const m = suggestMapping(["EMAIL ADDRESS", "Full name", "gender identity", "Something else"], targets);
    expect(m).toEqual({ "EMAIL ADDRESS": "email", "Full name": "full_name", "gender identity": "gender_identity", "Something else": "ignore" });
  });
});

describe("planImport", () => {
  const headers = ["Email", "Names", "Gender Identity", "Notes"];
  const mapping = suggestMapping(headers, targets);

  it("counts valid rows, and reports rows with no or a bad email, with their sheet row number", () => {
    const plan = planImport(headers, [
      ["a@example.org", "Aline", "Female", "x"],
      ["", "No email", "Male", "x"],
      ["not-an-email", "Bad", "Male", "x"],
    ], mapping);
    expect(plan.total).toBe(3);
    expect(plan.valid).toBe(1);
    expect(plan.invalid).toEqual([
      { row: 3, message: "No email address" },
      { row: 4, message: '"not-an-email" is not a valid email address' },
    ]);
  });

  it("removes spaces and line breaks inside emails, and trims values", () => {
    const plan = planImport(headers, [[" a b@example.org\n", "  Aline   U ", "", ""]], mapping);
    expect(plan.rows[0].email).toBe("ab@example.org");
    expect(plan.rows[0].full_name).toBe("Aline U");
    expect(plan.rows[0].gender_identity).toBeNull();
  });

  it("keeps duplicate emails and counts them", () => {
    const plan = planImport(headers, [["a@example.org", "A", "", ""], ["A@example.org", "A again", "", ""]], mapping);
    expect(plan.valid).toBe(2);
    expect(plan.duplicates).toBe(1);
  });

  it("lists the columns that are not mapped to any field", () => {
    const plan = planImport(headers, [["a@example.org", "A", "", "x"]], mapping);
    expect(plan.unmappedHeaders).toEqual(["Notes"]);
  });
});
