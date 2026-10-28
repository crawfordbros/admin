import type { IconName } from "../components/icons";
import type { NavCounts } from "../lib/api";

// The Admin Portal sidebar (ADMIN_PORTAL_SPEC section 3.3). Properties live inside Organizations.
// `detail` describes sections that haven't been built yet.

export type AdminNavItem = {
  path: string;
  label: string;
  icon: IconName;
  detail: string;
  badge?: keyof NavCounts;
  badgeTone?: "alert" | "gold";
  tag?: string;
};

export const ADMIN_NAV: { group: string; items: AdminNavItem[] }[] = [
  {
    group: "Operations",
    items: [
      { path: "/admin", label: "Overview", icon: "grid", detail: "What needs attention tonight: open reports, violations to review, valets clocked in and new quote requests." },
      { path: "/admin/reports", label: "Reports", icon: "bar-chart", badge: "openReports", badgeTone: "alert", detail: "Resident reports by property, type, status and date, with the 24-hour reply clock, bulk assign and CSV export." },
      { path: "/admin/violations", label: "Violations", icon: "alert-triangle", badge: "newViolations", badgeTone: "alert", detail: "Violations logged by valets with photos, reviewed by CBES and then sent to the property." },
      { path: "/admin/overwatch", label: "Overwatch", icon: "eye", tag: "Phase 2", detail: "Units that reach the violation threshold, with their history." },
      { path: "/admin/weekly-reports", label: "Weekly Reports", icon: "calendar", detail: "Each property's weekly report: send or download per property or organization, and see what was delivered." },
    ],
  },
  {
    group: "Accounts",
    items: [
      { path: "/admin/organizations", label: "Organizations", icon: "building", detail: "Management companies, their properties, representatives and invitations." },
      { path: "/admin/users", label: "Users", icon: "users", detail: "Everyone with portal access, their roles and two-step verification." },
      { path: "/admin/quotes", label: "Quotes", icon: "mail", badge: "newQuotes", badgeTone: "gold", detail: "Quote requests from the website, answered from quotes@cbenvironments.com." },
      { path: "/admin/settings", label: "Settings", icon: "settings", detail: "Overwatch threshold, issue and violation types, service calendar and weekly report schedule." },
    ],
  },
];

export const ADMIN_SECTIONS = ADMIN_NAV.flatMap((g) => g.items);

/** The section a path belongs to, for the breadcrumb and the active sidebar item. */
export const sectionFor = (pathname: string) =>
  [...ADMIN_SECTIONS].sort((a, b) => b.path.length - a.path.length).find((s) => pathname === s.path || pathname.startsWith(`${s.path}/`));
