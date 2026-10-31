import { describe, expect, it } from "vitest";
import { byWeek, crewOrder, percent, propertyTone, weekOf, type CheckInHistoryItem, type CrewMember, type CrewProperty } from "./crew-board";
import { buildingsLabel, checkInFlags, statusLine } from "./crew-display";
import { replyQueue, type CrewIssue } from "./issues";
import { translate } from "./strings";

const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate("en", key, vars);

const member = (over: Partial<CrewMember> = {}): CrewMember => ({
  id: "m1",
  name: "Marcus Hill",
  role: "valet",
  isSteward: false,
  photoUrl: null,
  phone: "+14045550101",
  buildings: ["1", "2"],
  doors: { done: 78, total: 104 },
  state: "in",
  minutesLate: null,
  checkIn: { checkedInAt: "2026-10-28T23:58:00Z", checkedOutAt: null, insideGeofence: true, distanceM: 40, reason: null, autoCheckedOut: false, lateSync: false },
  elsewhere: null,
  ...over,
});

const property = (crew: CrewMember[]): CrewProperty => ({
  id: "p1",
  name: "The Oaks",
  stewardId: "s1",
  startTime: "20:00",
  startsAt: "2026-10-29T00:00:00Z",
  doors: { done: 104, total: 312 },
  buildings: [],
  crew,
});

describe("crew view", () => {
  it("says when someone came in, or why they haven't", () => {
    expect(statusLine(member(), "20:00", t, "en")).toBe("In 7:58 PM · 78 of 104 doors");
    expect(statusLine(member({ state: "late", checkIn: null }), "20:00", t, "en")).toBe("Not checked in");
    expect(statusLine(member({ state: "later", checkIn: null }), "22:15", t, "en")).toBe("Starts 10:15 PM");
    expect(statusLine(member({ state: "elsewhere", checkIn: null, elsewhere: { propertyId: "p2", propertyName: "Clarkston" } }), "20:00", t, "en")).toBe("On shift at Clarkston");
  });

  it("names buildings the way Tonight does", () => {
    expect(buildingsLabel(["1", "2"], t)).toBe("Bldgs 1–2");
    expect(buildingsLabel(["5"], t)).toBe("Bldg 5");
    expect(buildingsLabel([], t)).toBe("All buildings");
  });

  it("flags check-ins outside the area, synced late or closed at 4 AM", () => {
    const flagged = member({ checkIn: { ...member().checkIn!, insideGeofence: false, reason: "Gate locked", lateSync: true, autoCheckedOut: true } });
    expect(checkInFlags(flagged, t)).toEqual(["Checked in outside the area: Gate locked", "Check-in synced late", "Checked out at 4 AM"]);
    expect(checkInFlags(member(), t)).toEqual([]);
  });

  it("puts late people first and colours the property by its worst state", () => {
    const crew = [member({ id: "a" }), member({ id: "b", state: "late" }), member({ id: "c", state: "due" })];
    expect(crewOrder(crew).map((m) => m.id)).toEqual(["b", "c", "a"]);
    expect(propertyTone(property(crew))).toBe("bad");
    expect(propertyTone(property([member({ state: "due" })]))).toBe("warn");
    expect(propertyTone(property([member()]))).toBe("ok");
    expect(propertyTone(property([member({ state: "later" })]))).toBe("quiet");
    expect(percent({ done: 104, total: 312 })).toBe(33);
    expect(percent({ done: 0, total: 0 })).toBe(0);
  });
});

describe("check-in history", () => {
  const item = (id: string, serviceDate: string, hours: number | null): CheckInHistoryItem => ({
    id,
    propertyId: "p1",
    propertyName: "The Oaks",
    serviceDate,
    checkedInAt: `${serviceDate}T23:00:00Z`,
    checkedOutAt: hours == null ? null : `${serviceDate}T23:30:00Z`,
    hours,
    insideGeofence: true,
    autoCheckedOut: false,
    lateSync: false,
  });

  it("groups shifts by the Sunday their week starts", () => {
    expect(weekOf("2026-10-28")).toBe("2026-10-25");
    expect(weekOf("2026-10-25")).toBe("2026-10-25");
    const weeks = byWeek([item("a", "2026-10-28", 3.5), item("b", "2026-10-26", 4.2), item("c", "2026-10-22", null)]);
    expect(weeks.map((w) => [w.start, w.items.length, w.hours])).toEqual([
      ["2026-10-25", 2, 7.7],
      ["2026-10-18", 1, 0],
    ]);
  });
});

describe("replyQueue", () => {
  it("puts fixed issues waiting on a reply first", () => {
    const issue = (id: string, needsReply: boolean) => ({ id, needsReply }) as CrewIssue;
    expect(replyQueue([issue("a", false), issue("b", true), issue("c", false), issue("d", true)]).map((i) => i.id)).toEqual(["b", "d", "a", "c"]);
  });
});
