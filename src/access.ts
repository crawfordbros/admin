// Roles from BUILD_BRIEF section 6, plus representatives of an organization (management company)
// and the one Super Admin who adds admins (ADMIN_PORTAL_SPEC section 2).
// The role comes from the Clerk user's public metadata ({ "role": "admin" }); the API sets it when
// someone is invited and checks organization and property access on every request. These client
// checks only decide what to show.

export const ROLES = ["super_admin", "admin", "representative", "lead", "valet", "director", "manager"] as const;
export type Role = (typeof ROLES)[number];

export type Area = "portal" | "admin" | "valet" | "manager" | "organization";

const AREA_ROLES: Record<Area, readonly Role[]> = {
  portal: ROLES,
  admin: ["super_admin", "admin"],
  valet: ["super_admin", "admin", "lead", "valet"],
  manager: ["super_admin", "admin", "representative", "director", "manager"],
  organization: ["super_admin", "admin", "representative"],
};

/** Shown to someone signed in whose role doesn't include the area. */
export const AREA_DENIED: Record<Area, string> = {
  portal: "This area is for CBES staff and the property managers CBES works with.",
  admin: "This area is for CBES admins.",
  valet: "This area is for CBES valets and Stewards.",
  manager: "This area is for property managers and their organization's representatives.",
  organization: "This area is for your organization's representatives.",
};

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  representative: "Representative",
  // Stored as "lead": a valet's direct supervisor.
  lead: "Steward",
  valet: "Valet",
  director: "Management Director",
  manager: "Property manager",
};

export function roleFrom(publicMetadata: Record<string, unknown> | undefined): Role | null {
  const role = publicMetadata?.role;
  return typeof role === "string" && (ROLES as readonly string[]).includes(role) ? (role as Role) : null;
}

export function canAccess(role: Role | null, area: Area): boolean {
  return role !== null && AREA_ROLES[area].includes(role);
}

export const isAdmin = (role: Role | null) => role === "admin" || role === "super_admin";
export const isSuperAdmin = (role: Role | null) => role === "super_admin";
