// Which organization or property the Property Portal is showing (REP_PORTAL_SPEC 3.1): the URL
// wins, then the last one used on this device, then the first one the person has.

export type ContextKind = "organization" | "property" | "none";
export type StoredContext = { orgId?: string; propertyId?: string };

export const CONTEXT_KEY = "cbes.portal.context";

export function readStoredContext(): StoredContext {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(CONTEXT_KEY) ?? "{}");
    if (!v || typeof v !== "object") return {};
    const { orgId, propertyId } = v as Record<string, unknown>;
    return { ...(typeof orgId === "string" ? { orgId } : {}), ...(typeof propertyId === "string" ? { propertyId } : {}) };
  } catch {
    return {};
  }
}

export function storeContext(patch: StoredContext) {
  try {
    localStorage.setItem(CONTEXT_KEY, JSON.stringify({ ...readStoredContext(), ...patch }));
  } catch {
    // Private windows can refuse storage; the URL still decides.
  }
}

type Input = {
  kind: ContextKind;
  route: { orgId?: string; propertyId?: string };
  query: { org?: string | null; property?: string | null };
  stored: StoredContext;
  organizations: { id: string }[];
  properties: { id: string; organizationId: string | null }[];
};

/** The organization id (Representatives) or property id (managers) to show, or null. */
export function resolvePortalContext({ kind, route, query, stored, organizations, properties }: Input): string | null {
  const pick = (candidates: (string | null | undefined)[], options: { id: string }[]) =>
    candidates.find((c) => c && options.some((o) => o.id === c)) ?? options[0]?.id ?? null;
  const orgOf = (propertyId: string | null | undefined) => properties.find((p) => p.id === propertyId)?.organizationId;
  if (kind === "organization") {
    return pick([route.orgId, query.org, orgOf(route.propertyId), orgOf(query.property), stored.orgId], organizations);
  }
  if (kind === "property") return pick([route.propertyId, query.property, stored.propertyId], properties);
  return null;
}

/** List pages scope by ?org= or ?property=; switching keeps the page and changes the scope. */
const LISTS = ["/portal/violations", "/portal/issues", "/portal/reporting"];

/** Where choosing another organization or property in the sidebar goes from the current page. */
export function switchPath(kind: "organization" | "property", id: string, pathname: string, search: string): string {
  const base = kind === "organization" ? "/portal/organizations" : "/portal/properties";
  const own = pathname.match(kind === "organization" ? /^\/portal\/organizations\/[^/]+(\/settings)?/ : /^\/portal\/properties\/[^/]+(\/report)?/);
  if (own) return `${base}/${id}${own[1] ?? ""}`;
  if (LISTS.includes(pathname)) {
    const params = new URLSearchParams(search);
    params.delete("org");
    params.delete("property");
    params.delete("page");
    params.set(kind === "organization" ? "org" : "property", id);
    return `${pathname}?${params}`;
  }
  return `${base}/${id}`;
}
