// Roles from BUILD_BRIEF section 6. In Phase 1 the role comes from the Clerk user's public metadata
// ({ "role": "admin" }, set in the Clerk dashboard). Phase 2 moves roles and property access into
// D1 and the API enforces them on every request; these client checks only decide what to show.

export const ROLES = ["admin", "lead", "valet", "director", "manager"] as const;
export type Role = (typeof ROLES)[number];

export type Area = "portal" | "admin" | "valet" | "manager";

const AREA_ROLES: Record<Area, readonly Role[]> = {
  portal: ROLES,
  admin: ["admin"],
  valet: ["admin", "lead", "valet"],
  manager: ["admin", "director", "manager"],
};

export const ROLE_LABELS: Record<Role, string> = {
  admin: "CBES admin",
  lead: "Area lead",
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
