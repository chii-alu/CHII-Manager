import { describe, expect, it } from "vitest";
import { FEEDBACK_COLUMNS, PARTICIPANT_COLUMNS } from "./columns";

describe("workbook columns", () => {
  it("has the spec's 21 participant columns, in order", () => {
    expect(PARTICIPANT_COLUMNS).toHaveLength(21);
    expect(PARTICIPANT_COLUMNS[0][1]).toBe("Email");
    expect(PARTICIPANT_COLUMNS[20][1]).toBe("Times supported (incl. repeats)");
  });

  it("has the spec's 19 feedback columns, in order", () => {
    expect(FEEDBACK_COLUMNS).toHaveLength(19);
    expect(FEEDBACK_COLUMNS[2][1]).toBe("Completion Status");
    expect(FEEDBACK_COLUMNS[18][1]).toBe("Suggested Improvements");
  });
});
