import { describe, expect, it } from "vitest";
import { buildingList, clockTime, dayLabel, dayTime, distanceM, insideArea, metersLabel, nightOf, span, wallTime, whenLabel } from "./shifts";

const property = { id: "p", name: "Oaks", address: null, city: null, lat: 33.8, lng: -84.25, geofenceRadiusM: 150 };

describe("shift helpers", () => {
  it("measures distance and the check-in area the way the API does", () => {
    expect(distanceM({ lat: 33.8, lng: -84.25 }, { lat: 33.8009, lng: -84.25 })).toBe(100);
    expect(insideArea(property, { lat: 33.8009, lng: -84.25, accuracyM: 5 })).toEqual({ distance: 100, inside: true });
    expect(insideArea(property, { lat: 33.809, lng: -84.25, accuracyM: 10 }).inside).toBe(false);
    expect(insideArea({ ...property, lat: null }, { lat: 1, lng: 1, accuracyM: 1 })).toEqual({ distance: null, inside: true });
  });

  it("formats times in Atlanta, in either language", () => {
    expect(clockTime("2026-10-29T00:15:00Z", "en")).toBe("8:15 PM");
    expect(wallTime("21:00", "en")).toBe("9:00 PM");
    expect(dayLabel("2026-11-01", "en")).toBe("Sunday, Nov 1");
    expect(dayLabel("2026-11-01", "es")).toMatch(/^domingo/);
  });

  it("labels building runs, spans and distances", () => {
    expect(buildingList(["1", "2", "3"])).toBe("1–3");
    expect(buildingList(["1", "3"])).toBe("1, 3");
    expect(buildingList(["A"])).toBe("A");
    expect(span(0, 72 * 60_000)).toEqual({ h: 1, m: 12 });
    expect(metersLabel(120)).toBe("120 m");
    expect(metersLabel(1400)).toBe("1.4 km");
  });

  it("labels when something happened by service night", () => {
    // 1:30 AM Thursday in Atlanta is still Wednesday night's service.
    expect(nightOf(Date.parse("2026-10-29T05:30:00Z"))).toBe("2026-10-28");
    const now = Date.parse("2026-10-29T03:00:00Z");
    expect(whenLabel("2026-10-29T01:14:00Z", "en", "Tonight", now)).toBe("Tonight 9:14 PM");
    expect(whenLabel("2026-10-27T01:14:00Z", "en", "Tonight", now)).toBe("Mon 9:14 PM");
  });
});

describe("dayTime", () => {
  const words = { today: "Today", yesterday: "Yesterday" };
  const now = Date.parse("2026-10-31T15:44:00Z"); // 11:44 AM in Atlanta
  it("names the calendar day in Atlanta, not the service night", () => {
    expect(dayTime("2026-10-31T15:40:00Z", "en", words, now)).toBe("Today 11:40 AM");
    expect(dayTime("2026-10-31T03:30:00Z", "en", words, now)).toBe("Yesterday 11:30 PM");
    expect(dayTime("2026-10-27T23:00:00Z", "en", words, now)).toBe("Tue 7:00 PM");
    expect(dayTime("2026-10-03T23:00:00Z", "en", words, now)).toBe("Oct 3 7:00 PM");
  });
});
