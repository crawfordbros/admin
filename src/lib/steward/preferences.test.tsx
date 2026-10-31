import { describe, expect, it } from "vitest";
import { deviceLocale, resolveTheme } from "./preferences";
import { dayPart, serviceDateLabel, serviceHour } from "./time";

describe("Steward preferences", () => {
  it("starts in Spanish when the phone is set to Spanish", () => {
    expect(deviceLocale(["es-MX", "en-US"])).toBe("es");
    expect(deviceLocale(["en-US", "es"])).toBe("en");
    expect(deviceLocale([])).toBe("en");
  });

  it("follows the phone unless light or dark is chosen", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});

describe("Steward time", () => {
  // 01:30 UTC on Oct 29 is 9:30 PM on Wednesday, Oct 28 in Atlanta.
  const night = new Date("2026-10-29T01:30:00Z");

  it("uses Atlanta time for the shift", () => {
    expect(serviceHour(night)).toBe(21);
    expect(serviceDateLabel("en", night)).toBe("Wednesday, Oct 28");
    expect(serviceDateLabel("es", night)).toMatch(/^miércoles, 28 (de )?oct/);
  });

  it("greets by the time of day", () => {
    expect(dayPart(7)).toBe("morning");
    expect(dayPart(13)).toBe("afternoon");
    expect(dayPart(21)).toBe("evening");
    expect(dayPart(2)).toBe("evening");
  });
});
