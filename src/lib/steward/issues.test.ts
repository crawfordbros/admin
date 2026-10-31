import { describe, expect, it } from "vitest";
import { clockLabel, issueByline, issueWhere, unitLine, type CrewIssue } from "./issues";
import { translate } from "./strings";

const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate("en", key, vars);
const when = (iso: string) => `at ${iso}`;

const base: CrewIssue = {
  id: "r1",
  refNo: 1042,
  typeKey: "missed_pickup",
  typeLabel: "Missed pickup",
  typeLabelEs: "Recolección perdida",
  propertyId: "p1",
  propertyName: "The Oaks",
  building: "3",
  unit: "305",
  description: "Still at my door",
  status: "assigned",
  createdAt: "2026-10-31T00:00:00Z",
  resolvedAt: null,
  replyClock: { state: "open", hoursLeft: 20.4, targetHours: 24 },
  needsReply: false,
  assignee: { id: "me", name: "Marcus Hill", photoUrl: null },
  lastChange: { kind: "status", toStatus: "assigned", actorId: "dana", actorName: "Dana Brooks", at: "8:10" },
};

describe("clockLabel", () => {
  it("counts down the reply target and flags the last few hours", () => {
    expect(clockLabel(base)).toEqual({ key: "issues.dueIn", vars: { h: 20 }, hot: false });
    expect(clockLabel({ ...base, replyClock: { state: "open", hoursLeft: 3, targetHours: 24 } })?.hot).toBe(true);
    expect(clockLabel({ ...base, replyClock: { state: "open", hoursLeft: 0.4, targetHours: 24 } })?.key).toBe("issues.dueSoon");
    expect(clockLabel({ ...base, replyClock: { state: "open", hoursLeft: -2.6, targetHours: 24 } })).toEqual({ key: "issues.overdue", vars: { h: 3 }, hot: true });
  });

  it("says a reply is needed once it's fixed, and nothing once replied", () => {
    expect(clockLabel({ ...base, status: "resolved", needsReply: true, replyClock: { state: "none" } })?.key).toBe("issues.replyNeeded");
    expect(clockLabel({ ...base, replyClock: { state: "replied", hours: 2 } })).toBeNull();
  });
});

describe("where", () => {
  it("uses whatever the resident gave", () => {
    expect(issueWhere(base, t)).toBe("The Oaks · Bldg 3 · Unit 305");
    expect(issueWhere({ ...base, building: null }, t)).toBe("The Oaks · Unit 305");
    expect(issueWhere({ ...base, building: null, unit: null }, t)).toBe("The Oaks");
    expect(unitLine({ building: null, unit: null }, t)).toBe("No unit given");
  });
});

describe("issueByline", () => {
  it("says who assigned it to you", () => {
    expect(issueByline(base, "me", t, when)).toBe("Assigned by Dana Brooks · at 8:10");
  });

  it("says when you or someone else started or fixed it", () => {
    expect(issueByline({ ...base, status: "in_progress", lastChange: { ...base.lastChange!, toStatus: "in_progress", actorId: "me" } }, "me", t, when)).toBe("You started at 8:10");
    expect(issueByline({ ...base, status: "resolved", lastChange: { ...base.lastChange!, toStatus: "resolved", actorId: "me", actorName: "Marcus Hill" } }, "dana", t, when)).toBe(
      "Marcus Hill fixed it at 8:10",
    );
  });

  it("tells a Steward who has it, or that no one does", () => {
    expect(issueByline(base, "dana", t, when)).toBe("Assigned to Marcus Hill");
    expect(issueByline({ ...base, status: "new", assignee: null, lastChange: null }, "dana", t, when)).toBe("Not assigned yet");
  });
});
