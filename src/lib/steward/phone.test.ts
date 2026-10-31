import { describe, expect, it } from "vitest";
import { displayPhone, usMobile } from "./phone";

describe("US mobile numbers", () => {
  it("accepts 10 digits however they're typed", () => {
    expect(usMobile("(404) 555-0119")).toBe("+14045550119");
    expect(usMobile("1 404 555 0119")).toBe("+14045550119");
    expect(usMobile("+1-404-555-0119")).toBe("+14045550119");
  });

  it("refuses short and foreign numbers", () => {
    expect(usMobile("555-0119")).toBeNull();
    expect(usMobile("+44 20 7946 0958")).toBeNull();
  });

  it("shows stored numbers the usual way", () => {
    expect(displayPhone("+14045550119")).toBe("(404) 555-0119");
    expect(displayPhone(null)).toBe("");
  });
});
