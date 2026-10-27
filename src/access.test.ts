import { describe, expect, it } from "vitest";
import { canAccess, roleFrom } from "./access";

describe("roleFrom", () => {
  it("reads a known role from Clerk public metadata", () => {
    expect(roleFrom({ role: "admin" })).toBe("admin");
    expect(roleFrom({ role: "valet" })).toBe("valet");
  });

  it("returns null for missing or unknown roles", () => {
    expect(roleFrom(undefined)).toBeNull();
    expect(roleFrom({})).toBeNull();
    expect(roleFrom({ role: "superuser" })).toBeNull();
    expect(roleFrom({ role: 7 })).toBeNull();
  });
});

describe("canAccess", () => {
  it("lets only admins into the admin area", () => {
    expect(canAccess("admin", "admin")).toBe(true);
    for (const role of ["representative", "lead", "valet", "director", "manager"] as const) expect(canAccess(role, "admin")).toBe(false);
  });

  it("lets every staff role into the portal", () => {
    for (const role of ["admin", "representative", "lead", "valet", "director", "manager"] as const) expect(canAccess(role, "portal")).toBe(true);
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

  it("denies signed-in users with no role yet", () => {
    expect(canAccess(null, "portal")).toBe(false);
  });
});
