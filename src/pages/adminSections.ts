// Admin areas from BUILD_BRIEF section 5. Each one is built in Phase 2 or 3.
export const ADMIN_SECTIONS = [
  { path: "/admin", label: "Overview", detail: "KPIs, violations by type, Overwatch list and latest reports." },
  { path: "/admin/reports", label: "Reports", detail: "Resident reports by property, type, status and date, with bulk assign and CSV export." },
  { path: "/admin/violations", label: "Violations", detail: "Violations logged by valets, with photos, filters and CSV export." },
  { path: "/admin/overwatch", label: "Overwatch", detail: "Units over the violation threshold, with history." },
  { path: "/admin/properties", label: "Properties", detail: "Properties, buildings, units, contacts and weekly report recipients." },
  { path: "/admin/users", label: "Users", detail: "Invite staff and property managers and set their roles and properties." },
  { path: "/admin/weekly-reports", label: "Weekly reports", detail: "Sent log, preview any week, resend. (Phase 3)" },
  { path: "/admin/quotes", label: "Quotes", detail: "Quote and contact requests: new, contacted, quoted, won, lost." },
  { path: "/admin/settings", label: "Settings", detail: "Overwatch threshold, issue and violation types, holiday dates." },
] as const;
