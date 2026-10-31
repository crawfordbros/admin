import { describe, expect, it } from "vitest";
import { buildingLabel, unitLabel, whereLabel } from "./format";

describe("where things are", () => {
  it("prefixes unit numbers, and leaves free text as written", () => {
    expect(unitLabel("412")).toBe("Unit 412");
    expect(unitLabel("12B")).toBe("Unit 12B");
    expect(unitLabel("2nd floor")).toBe("2nd floor");
    expect(unitLabel("Bldg 4, Unit 291")).toBe("Bldg 4, Unit 291");
  });

  it("prefixes building numbers and letters only", () => {
    expect(buildingLabel("4")).toBe("Bldg 4");
    expect(buildingLabel("B", "Building")).toBe("Building B");
    expect(buildingLabel("2nd building")).toBe("2nd building");
    expect(buildingLabel("Tower North")).toBe("Tower North");
  });

  it("joins whatever was recorded", () => {
    expect(whereLabel("4", "412")).toBe("Bldg 4 · Unit 412");
    expect(whereLabel(null, "2nd floor")).toBe("2nd floor");
    expect(whereLabel(null, null)).toBe("");
  });
});
