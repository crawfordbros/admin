import { describe, expect, it } from "vitest";
import { greeting, longDay, timeAgo } from "./format";

describe("greeting", () => {
  // October 27, 2026 is in daylight time: New York is UTC-4.
  it("follows the time in New York, not the browser", () => {
    expect(greeting(new Date("2026-10-27T15:59:00Z"))).toBe("Good morning");
    expect(greeting(new Date("2026-10-27T16:00:00Z"))).toBe("Good afternoon");
    expect(greeting(new Date("2026-10-27T21:00:00Z"))).toBe("Good evening");
    expect(greeting(new Date("2026-10-28T03:30:00Z"))).toBe("Good evening");
  });
});

describe("longDay", () => {
  it("names the New York day", () => {
    expect(longDay(new Date("2026-10-28T03:30:00Z"))).toBe("Tuesday, October 27");
  });
});

describe("timeAgo", () => {
  const now = Date.parse("2026-10-27T21:00:00Z");
  it("rounds to the largest sensible unit", () => {
    expect(timeAgo("2026-10-27T20:59:40Z", now)).toBe("just now");
    expect(timeAgo("2026-10-27T20:48:00Z", now)).toBe("12 min ago");
    expect(timeAgo("2026-10-27T18:00:00Z", now)).toBe("3 h ago");
    expect(timeAgo("2026-10-25T21:00:00Z", now)).toBe("2 d ago");
    expect(timeAgo("2026-10-01T21:00:00Z", now)).toBe("Oct 1, 2026");
  });
});
