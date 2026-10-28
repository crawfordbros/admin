import { describe, expect, it } from "vitest";
import { ROLE_LABELS, canAccess, isAdmin, isSuperAdmin, roleFrom } from "./access";

describe("roleFrom", () => {
  it("reads a known role from Clerk public metadata", () => {
    expect(roleFrom({ role: "admin" })).toBe("admin");
    expect(roleFrom({ role: "valet" })).toBe("valet");
    expect(roleFrom({ role: "super_admin" })).toBe("super_admin");
  });

  it("returns null for missing or unknown roles", () => {
    expect(roleFrom(undefined)).toBeNull();
    expect(roleFrom({})).toBeNull();
    expect(roleFrom({ role: "superuser" })).toBeNull();
    expect(roleFrom({ role: 7 })).toBeNull();
  });
});

describe("canAccess", () => {
  it("lets only admins and the Super Admin into the admin area", () => {
    expect(canAccess("admin", "admin")).toBe(true);
    expect(canAccess("super_admin", "admin")).toBe(true);
    for (const role of ["representative", "lead", "valet", "director", "manager"] as const) expect(canAccess(role, "admin")).toBe(false);
  });

  it("lets every staff role into the portal", () => {
    for (const role of ["super_admin", "admin", "representative", "lead", "valet", "director", "manager"] as const) expect(canAccess(role, "portal")).toBe(true);
  });

  it("splits valet and manager screens by role", () => {
    expect(canAccess("valet", "valet")).toBe(true);
    expect(canAccess("lead", "valet")).toBe(true);
    expect(canAccess("manager", "valet")).toBe(false);
    expect(canAccess("director", "manager")).toBe(true);
    expect(canAccess("valet", "manager")).toBe(false);
  });

  it("gives representatives their organization and its property pages", () => {
    expect(roleFrom({ role: "representative" })).toBe("representative");
    expect(canAccess("representative", "organization")).toBe(true);
    expect(canAccess("representative", "manager")).toBe(true);
    expect(canAccess("manager", "organization")).toBe(false);
    expect(canAccess("director", "organization")).toBe(false);
  });

  it("gives the Super Admin every area an admin has", () => {
    for (const area of ["portal", "admin", "valet", "manager", "organization"] as const) {
      expect(canAccess("super_admin", area)).toBe(canAccess("admin", area));
    }
  });

  it("denies signed-in users with no role yet", () => {
    expect(canAccess(null, "portal")).toBe(false);
  });
});

describe("admin helpers", () => {
  it("treats admins and the Super Admin as admins", () => {
    expect(isAdmin("admin")).toBe(true);
    expect(isAdmin("super_admin")).toBe(true);
    expect(isAdmin("representative")).toBe(false);
    expect(isAdmin(null)).toBe(false);
  });

  it("keeps adding admins to the Super Admin", () => {
    expect(isSuperAdmin("super_admin")).toBe(true);
    expect(isSuperAdmin("admin")).toBe(false);
  });

  it("labels the lead role Steward", () => {
    expect(ROLE_LABELS.lead).toBe("Steward");
    expect(ROLE_LABELS.super_admin).toBe("Super Admin");
  });
});
