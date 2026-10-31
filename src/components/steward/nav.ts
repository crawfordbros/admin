import type { Role } from "../../access";
import type { StringKey } from "../../lib/steward/strings";

// Tabs from STEWARD_APP_SPEC section 3: valets and Stewards each get five. Admins preview the Steward set.

export type TabKey = "tonight" | "violations" | "issues" | "property" | "crew" | "review" | "me";

export type Tab = { key: TabKey; label: StringKey; to: string; end?: boolean };

const TABS: Record<TabKey, Tab> = {
  tonight: { key: "tonight", label: "nav.tonight", to: "/steward", end: true },
  violations: { key: "violations", label: "nav.violations", to: "/steward/violations" },
  issues: { key: "issues", label: "nav.issues", to: "/steward/issues" },
  property: { key: "property", label: "nav.property", to: "/steward/properties" },
  crew: { key: "crew", label: "nav.crew", to: "/steward/crew" },
  review: { key: "review", label: "nav.review", to: "/steward/review" },
  me: { key: "me", label: "nav.me", to: "/steward/me" },
};

export type CrewView = "valet" | "steward";

/** Stewards (stored as `lead`) and admins run a crew; everyone else in the area is a valet. */
export const crewView = (role: Role | null): CrewView => (role === "lead" || role === "admin" || role === "super_admin" ? "steward" : "valet");

export function tabsFor(view: CrewView): Tab[] {
  const keys: TabKey[] = view === "steward" ? ["tonight", "crew", "review", "issues", "me"] : ["tonight", "violations", "issues", "property", "me"];
  return keys.map((k) => TABS[k]);
}

/** Paths only Stewards use. A valet who follows an old link lands on Tonight. */
export const STEWARD_ONLY: TabKey[] = ["crew", "review"];
