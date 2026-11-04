import { describe, expect, it } from "vitest";
import { answerText, buildExtras } from "./extras";

describe("buildExtras", () => {
  it("appends only the questions the fixed columns do not cover, in first-used order", () => {
    const e = buildExtras(
      [
        { responseId: "r1", fieldKey: "relevance", value: "Very relevant" },
        { responseId: "r1", fieldKey: "venture_stage", value: "Idea" },
        { responseId: "r2", fieldKey: "hire_drivers", value: "Better soft skills" },
        { responseId: "r2", fieldKey: "venture_stage", value: "Scaling" },
      ],
      new Set(["relevance", "nps"]),
      new Map([["venture_stage", "Venture stage"]]),
    );
    expect(e.keys).toEqual(["extra_venture_stage", "extra_hire_drivers"]);
    expect(e.labels.get("extra_venture_stage")).toBe("Venture stage");
    expect(e.labels.get("extra_hire_drivers")).toBe("hire_drivers");
    expect(e.byResponse.get("r1")).toEqual({ extra_venture_stage: "Idea" });
    expect(e.byResponse.get("r2")).toEqual({ extra_hire_drivers: "Better soft skills", extra_venture_stage: "Scaling" });
  });

  it("skips empty answers", () => {
    const e = buildExtras([{ responseId: "r1", fieldKey: "venture_stage", value: "" }], new Set(), new Map());
    expect(e.keys).toEqual([]);
  });
});

describe("answerText", () => {
  it("reads whichever value is set, and joins multi-select answers", () => {
    expect(answerText({ value_text: "Idea", value_number: null, value_json: null })).toBe("Idea");
    expect(answerText({ value_text: null, value_number: 7, value_json: null })).toBe("7");
    expect(answerText({ value_text: null, value_number: null, value_json: ["Mentorship", "Funding"] })).toBe("Mentorship; Funding");
    expect(answerText({ value_text: null, value_number: null, value_json: null })).toBeNull();
  });
});
