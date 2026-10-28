import { describe, expect, it } from "vitest";
import { dateRange } from "./dates";
import { clockView } from "./replyClock";

const open = (hoursLeft: number) => clockView({ state: "open", hoursLeft, targetHours: 24 });

describe("clockView", () => {
  it("turns amber at 12 hours used and red at 20", () => {
    expect(open(12.1)).toEqual({ text: "12h left", tone: "success" });
    expect(open(12)).toEqual({ text: "12h left", tone: "warning" });
    expect(open(4.1)).toEqual({ text: "4h left", tone: "warning" });
    expect(open(4)).toEqual({ text: "4h left", tone: "danger" });
    expect(open(0.5)).toEqual({ text: "Under 1h left", tone: "danger" });
  });

  it("shows overdue reports and replies", () => {
    expect(open(-3)).toEqual({ text: "Overdue 3h", tone: "danger" });
    expect(clockView({ state: "replied", hours: 2.2 })).toEqual({ text: "Replied in 2h", tone: "neutral" });
    expect(clockView({ state: "replied", hours: 0.3 })).toEqual({ text: "Replied in under 1h", tone: "neutral" });
    expect(clockView({ state: "none" }).tone).toBe("neutral");
  });
});

describe("dateRange", () => {
  it("turns presets into New York dates", () => {
    expect(dateRange(["30d"], "2026-10-27")).toEqual({ from: "2026-09-28", to: "2026-10-27" });
    expect(dateRange(["today"], "2026-10-27")).toEqual({ from: "2026-10-27", to: "2026-10-27" });
    expect(dateRange(["month"], "2026-10-27")).toEqual({ from: "2026-10-01", to: "2026-10-27" });
    expect(dateRange(["2026-10-01", "2026-10-05"])).toEqual({ from: "2026-10-01", to: "2026-10-05" });
    expect(dateRange([])).toEqual({});
  });
});
