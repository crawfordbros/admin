import { afterEach, describe, expect, it } from "vitest";
import { CONTEXT_KEY, readStoredContext, resolvePortalContext, storeContext, switchPath } from "./context";

const organizations = [{ id: "org1" }, { id: "org2" }];
const properties = [
  { id: "p1", organizationId: "org1" },
  { id: "p2", organizationId: "org2" },
  { id: "p3", organizationId: "org2" },
];
const base = { route: {}, query: {}, stored: {}, organizations, properties };

afterEach(() => localStorage.clear());

describe("resolvePortalContext (REP_PORTAL_SPEC 3.1)", () => {
  it("lets the URL win over the last one used", () => {
    expect(resolvePortalContext({ ...base, kind: "organization", route: { orgId: "org2" }, stored: { orgId: "org1" } })).toBe("org2");
    expect(resolvePortalContext({ ...base, kind: "organization", query: { org: "org2" }, stored: { orgId: "org1" } })).toBe("org2");
    expect(resolvePortalContext({ ...base, kind: "property", query: { property: "p3" }, stored: { propertyId: "p2" } })).toBe("p3");
  });

  it("finds a Representative's organization from the property they opened", () => {
    expect(resolvePortalContext({ ...base, kind: "organization", route: { propertyId: "p2" }, stored: { orgId: "org1" } })).toBe("org2");
    expect(resolvePortalContext({ ...base, kind: "organization", query: { property: "p3" } })).toBe("org2");
  });

  it("falls back to the last one used, then the first", () => {
    expect(resolvePortalContext({ ...base, kind: "organization", stored: { orgId: "org2" } })).toBe("org2");
    expect(resolvePortalContext({ ...base, kind: "organization" })).toBe("org1");
    expect(resolvePortalContext({ ...base, kind: "property", stored: { propertyId: "p2" } })).toBe("p2");
    expect(resolvePortalContext({ ...base, kind: "property" })).toBe("p1");
  });

  it("ignores ids the person doesn't have", () => {
    expect(resolvePortalContext({ ...base, kind: "organization", route: { orgId: "someone-else" }, stored: { orgId: "gone" } })).toBe("org1");
    expect(resolvePortalContext({ ...base, kind: "property", query: { property: "nope" } })).toBe("p1");
  });

  it("has nothing for valets and Stewards, or before anything loads", () => {
    expect(resolvePortalContext({ ...base, kind: "none" })).toBeNull();
    expect(resolvePortalContext({ ...base, kind: "property", properties: [] })).toBeNull();
  });
});

describe("the last one used", () => {
  it("merges organization and property", () => {
    storeContext({ orgId: "org1" });
    storeContext({ propertyId: "p2" });
    expect(readStoredContext()).toEqual({ orgId: "org1", propertyId: "p2" });
  });

  it("survives junk in storage", () => {
    localStorage.setItem(CONTEXT_KEY, "{not json");
    expect(readStoredContext()).toEqual({});
    localStorage.setItem(CONTEXT_KEY, JSON.stringify({ orgId: 5 }));
    expect(readStoredContext()).toEqual({});
  });
});

describe("switchPath", () => {
  it("keeps the page when switching organization or property", () => {
    expect(switchPath("organization", "org2", "/portal/organizations/org1", "")).toBe("/portal/organizations/org2");
    expect(switchPath("organization", "org2", "/portal/organizations/org1/settings", "?tab=team")).toBe("/portal/organizations/org2/settings");
    expect(switchPath("property", "p2", "/portal/properties/p1/report", "?week=2026-10-18")).toBe("/portal/properties/p2/report");
  });

  it("rescopes list pages and starts them at page one", () => {
    expect(switchPath("organization", "org2", "/portal/violations", "?org=org1&status=resolved&page=3")).toBe("/portal/violations?status=resolved&org=org2");
    expect(switchPath("property", "p2", "/portal/issues", "?property=p1")).toBe("/portal/issues?property=p2");
  });

  it("goes home from a detail page", () => {
    expect(switchPath("organization", "org2", "/portal/violations/v1", "")).toBe("/portal/organizations/org2");
    expect(switchPath("property", "p2", "/portal/account", "")).toBe("/portal/properties/p2");
  });
});
