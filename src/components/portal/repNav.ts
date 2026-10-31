import type { IconName } from "../icons";
import type { PortalNavCounts } from "../../lib/api";

// The Property Portal sidebar (REP_PORTAL_SPEC 3.2). Links carry the organization or property the
// sidebar's switcher shows.

export type NavContext = { orgId: string; propertyId: string };

export type RepNavItem = {
  label: string;
  icon: IconName;
  /** null: shown but not a link yet (Overwatch, Phase 2). */
  to: ((ctx: NavContext) => string) | null;
  /** What the page is for; the ⌘K palette matches it. */
  detail: string;
  badge?: keyof PortalNavCounts;
  badgeTone?: "alert" | "gold";
  tag?: string;
  /** Only active on exactly this path (the dashboard, not its settings page). */
  end?: boolean;
};

export type RepNavGroup = { group: string; items: RepNavItem[] };

export const REP_NAV: Record<"representative" | "propertyStaff" | "fieldStaff", RepNavGroup[]> = {
  representative: [
    {
      group: "Portfolio",
      items: [
        { to: (c) => `/portal/organizations/${c.orgId}`, label: "Dashboard", icon: "grid", end: true, detail: "Every property, and what needs your attention." },
        { to: (c) => `/portal/violations?org=${c.orgId}`, label: "Violations", icon: "alert-triangle", badge: "violationsToReview", detail: "Violations CBES sent to your properties." },
        { to: (c) => `/portal/issues?org=${c.orgId}`, label: "Resident issues", icon: "message", badge: "openIssues", detail: "What residents report and how CBES replied." },
        { to: (c) => `/portal/reporting?scope=organization&org=${c.orgId}`, label: "Reporting", icon: "bar-chart", detail: "Weekly numbers for your organization." },
      ],
    },
    {
      group: "Organization",
      items: [
        {
          to: (c) => `/portal/organizations/${c.orgId}/settings`,
          label: "Team and settings",
          icon: "user-plus",
          badge: "pendingInvitations",
          badgeTone: "gold",
          detail: "Invite property managers and keep your organization's details current.",
        },
      ],
    },
  ],
  propertyStaff: [
    {
      group: "Property",
      items: [
        { to: (c) => `/portal/properties/${c.propertyId}`, label: "My property", icon: "grid", detail: "Your property's home page." },
        { to: (c) => `/portal/violations?property=${c.propertyId}`, label: "Violations", icon: "alert-triangle", badge: "violationsToReview", detail: "Violations CBES sent to your property." },
        { to: (c) => `/portal/issues?property=${c.propertyId}`, label: "Resident issues", icon: "message", badge: "openIssues", detail: "What residents report and how CBES replied." },
        { to: (c) => `/portal/reporting?scope=property&property=${c.propertyId}`, label: "Reporting", icon: "bar-chart", detail: "Weekly numbers for your property." },
        { to: null, label: "Overwatch", icon: "eye", tag: "Phase 2", detail: "Units with repeat violations. Coming in Phase 2." },
      ],
    },
    { group: "Account", items: [{ to: () => "/portal/account", label: "My account", icon: "settings", detail: "Your sign-in methods and email settings." }] },
  ],
  // Valets and Stewards open portal pages from notifications; they only get their account here.
  fieldStaff: [
    { group: "Account", items: [{ to: () => "/portal/settings", label: "Account settings", icon: "settings", detail: "Your password, two-step verification and devices." }] },
  ],
};

/** How a badge reads to a screen reader: "Violations, 3 to review". */
export const BADGE_TEXT: Record<keyof PortalNavCounts, (n: number) => string> = {
  violationsToReview: (n) => `${n} to review`,
  openIssues: (n) => `${n} open`,
  pendingInvitations: (n) => `${n} waiting`,
};
