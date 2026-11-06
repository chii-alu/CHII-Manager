import { describe, expect, it } from "vitest";
import { describeFilters, distinctValues, filterRows, isFiltered, NO_FILTERS, sortRows, type TableFilters } from "./table";

const rows = [
  { chii_id: "CHII-000002", intervention: "SIE", satisfaction: 5, town: "Kigali" },
  { chii_id: "CHII-000001", intervention: "Internship", satisfaction: 3, town: null },
  { chii_id: "CHII-000003", intervention: "SIE", satisfaction: null, town: "Lagos, NG" },
];
const columns = ["chii_id", "intervention", "satisfaction", "town"];
const pick = (f: Partial<TableFilters>): TableFilters => ({ ...NO_FILTERS, ...f });

describe("distinctValues", () => {
  it("lists each value once with its count, blanks last", () => {
    expect(distinctValues(rows, "intervention")).toEqual([
      { value: "Internship", count: 1 },
      { value: "SIE", count: 2 },
    ]);
    expect(distinctValues(rows, "town").at(-1)).toEqual({ value: "", count: 1 });
  });

  it("sorts numbers in the list naturally", () => {
    expect(distinctValues([{ n: 10 }, { n: 9 }, { n: 2 }], "n").map((d) => d.value)).toEqual(["2", "9", "10"]);
  });
});

describe("filterRows", () => {
  it("returns every row when nothing is filtered", () => {
    expect(filterRows(rows, columns, NO_FILTERS)).toHaveLength(3);
  });

  it("searches across all columns, ignoring case", () => {
    const found = filterRows(rows, columns, pick({ search: "sie" }));
    expect(found.map((r) => r.chii_id)).toEqual(["CHII-000002", "CHII-000003"]);
  });

  it("keeps only the ticked values of a column", () => {
    const found = filterRows(rows, columns, pick({ columns: { intervention: new Set(["SIE"]) } }));
    expect(found.map((r) => r.chii_id)).toEqual(["CHII-000002", "CHII-000003"]);
  });

  it("combines the filters of several columns", () => {
    const found = filterRows(
      rows,
      columns,
      pick({ columns: { intervention: new Set(["SIE"]), town: new Set(["Lagos, NG"]) } }),
    );
    expect(found.map((r) => r.chii_id)).toEqual(["CHII-000003"]);
  });

  it("can filter on blanks", () => {
    const found = filterRows(rows, columns, pick({ columns: { town: new Set([""]) } }));
    expect(found.map((r) => r.chii_id)).toEqual(["CHII-000001"]);
  });

  it("matches numbers by their text", () => {
    expect(filterRows(rows, columns, pick({ columns: { satisfaction: new Set(["5"]) } })).map((r) => r.chii_id)).toEqual(["CHII-000002"]);
  });

  it("ignores a filter on a column that is not in the sheet", () => {
    expect(filterRows(rows, columns, pick({ columns: { missing: new Set(["x"]) } }))).toHaveLength(3);
  });

  it("returns nothing when no value is ticked", () => {
    expect(filterRows(rows, columns, pick({ columns: { intervention: new Set() } }))).toHaveLength(0);
  });
});

describe("isFiltered", () => {
  it("is true when a search or a column filter is set", () => {
    expect(isFiltered(NO_FILTERS)).toBe(false);
    expect(isFiltered(pick({ search: "x" }))).toBe(true);
    expect(isFiltered(pick({ columns: { town: new Set(["Kigali"]) } }))).toBe(true);
  });
});

describe("sortRows", () => {
  it("keeps the original order when there is no sort", () => {
    expect(sortRows(rows, null)).toEqual(rows);
  });

  it("sorts numbers numerically in both directions", () => {
    expect(sortRows(rows, { column: "satisfaction", direction: "asc" }).map((r) => r.satisfaction)).toEqual([3, 5, null]);
    expect(sortRows(rows, { column: "satisfaction", direction: "desc" }).map((r) => r.satisfaction)).toEqual([5, 3, null]);
  });

  it("sorts text naturally, so CHII-000002 comes before CHII-000003", () => {
    expect(sortRows(rows, { column: "chii_id", direction: "asc" }).map((r) => r.chii_id)).toEqual(["CHII-000001", "CHII-000002", "CHII-000003"]);
  });

  it("puts blank values last in both directions", () => {
    expect(sortRows(rows, { column: "town", direction: "asc" }).map((r) => r.town)).toEqual(["Kigali", "Lagos, NG", null]);
    expect(sortRows(rows, { column: "town", direction: "desc" }).map((r) => r.town)).toEqual(["Lagos, NG", "Kigali", null]);
  });

  it("does not change the input array", () => {
    const copy = [...rows];
    sortRows(rows, { column: "chii_id", direction: "desc" });
    expect(rows).toEqual(copy);
  });
});

describe("describeFilters", () => {
  it("lists only the filters that are set, under their on-screen headings", () => {
    expect(
      describeFilters(pick({ search: " kigali ", columns: { intervention: new Set(["SIE"]), town: new Set(["", "Kigali"]) } }), {
        intervention: "Intervention",
        town: "Town",
      }),
    ).toEqual({ search: "kigali", Intervention: "SIE", Town: "(Blanks); Kigali" });
  });
});
