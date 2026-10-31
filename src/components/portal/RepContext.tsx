/* eslint-disable react-refresh/only-export-components -- the provider and its hooks belong together */
import { createContext, useCallback, useContext, useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useUser } from "@clerk/clerk-react";
import { matchPath, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { isAdmin, roleFrom, type Role } from "../../access";
import { useApi, type Me, type MeOrganization, type MeProperty, type PortalNavCounts } from "../../lib/api";
import { useManagerPreview } from "../../lib/preview";
import { REP_NAV, type RepNavGroup } from "./repNav";
import { readStoredContext, resolvePortalContext, storeContext, switchPath, type ContextKind } from "./context";

type RepContextValue = {
  kind: ContextKind;
  role: Role | null;
  me: Me | undefined;
  /** The organization shown (Representatives), or the current property's organization. */
  org: MeOrganization | null;
  /** The property shown (managers). */
  property: MeProperty | null;
  /** What the sidebar switcher offers: organizations for Representatives, properties for managers. */
  organizations: MeOrganization[];
  properties: MeProperty[];
  homePath: string;
  /** ?org= or ?property= for scoped calls, or null before the context is known. */
  scope: { org: string } | { property: string } | null;
  choose: (id: string) => void;
};

const RepContext = createContext<RepContextValue | null>(null);

/** The signed-in person's organizations and properties (GET /portal/me), shared with PortalHome. */
export function useMe() {
  const api = useApi();
  return useQuery({ queryKey: ["me"], queryFn: () => api<Me>("/portal/me") });
}

/** Admins have no memberships; they see the organizations of the properties they open. */
function organizationsFromProperties(properties: MeProperty[]): MeOrganization[] {
  const byId = new Map<string, MeOrganization>();
  for (const p of properties) {
    if (!p.organizationId) continue;
    const o = byId.get(p.organizationId) ?? { id: p.organizationId, name: p.organizationName ?? "Organization", propertyCount: 0, propertyLimit: 0, logoVersion: null };
    o.propertyCount += 1;
    byId.set(o.id, o);
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function RepContextProvider({ children }: { children: ReactNode }) {
  const { user } = useUser();
  const preview = useManagerPreview();
  const { pathname, search } = useLocation();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { data: me } = useMe();

  const role = roleFrom(user?.publicMetadata);
  const route = {
    orgId: matchPath({ path: "/portal/organizations/:orgId", end: false }, pathname)?.params.orgId,
    propertyId: matchPath({ path: "/portal/properties/:propertyId", end: false }, pathname)?.params.propertyId,
  };
  // Previewing, a Super Admin sees exactly what the property's manager sees.
  const kind: ContextKind = preview.on
    ? "property"
    : role === "representative"
      ? "organization"
      : role === "manager"
        ? "property"
        : isAdmin(role)
          ? route.orgId || params.get("org")
            ? "organization"
            : "property"
          : "none";

  const allProperties = me?.properties ?? [];
  const organizations = me ? (isAdmin(role) ? organizationsFromProperties(me.properties) : me.organizations) : [];
  const queryOrg = params.get("org");
  const queryProperty = params.get("property");

  const id = me
    ? resolvePortalContext({
        kind,
        route,
        query: { org: queryOrg, property: queryProperty },
        stored: readStoredContext(),
        organizations,
        properties: allProperties,
      })
    : null;

  const org = kind === "organization" ? (organizations.find((o) => o.id === id) ?? null) : null;
  const property = kind === "property" ? (allProperties.find((p) => p.id === id) ?? null) : null;

  useEffect(() => {
    if (!id) return;
    storeContext(kind === "organization" ? { orgId: id } : { propertyId: id });
  }, [id, kind]);

  const choose = useCallback(
    (next: string) => {
      if (kind === "none") return;
      storeContext(kind === "organization" ? { orgId: next } : { propertyId: next });
      navigate(switchPath(kind, next, pathname, search));
    },
    [kind, navigate, pathname, search],
  );

  const homePath = org ? `/portal/organizations/${org.id}` : property ? `/portal/properties/${property.id}` : "/portal";
  const value: RepContextValue = {
    kind,
    role,
    me,
    org: org ?? (property?.organizationId ? (organizations.find((o) => o.id === property.organizationId) ?? null) : null),
    property,
    organizations,
    properties: kind === "organization" ? allProperties.filter((p) => p.organizationId === org?.id) : allProperties,
    homePath,
    scope: org ? { org: org.id } : property ? { property: property.id } : null,
    choose,
  };
  return <RepContext.Provider value={value}>{children}</RepContext.Provider>;
}

export function useRepContext(): RepContextValue {
  const ctx = useContext(RepContext);
  if (!ctx) throw new Error("useRepContext must be used inside RepShell");
  return ctx;
}

/** Which sidebar the person gets: the organization's, a property's, or (valets, Stewards) just their account. */
export function useRepNav(): RepNavGroup[] {
  const { kind } = useRepContext();
  return kind === "organization" ? REP_NAV.representative : kind === "property" ? REP_NAV.propertyStaff : REP_NAV.fieldStaff;
}

/** The context, or null on pages rendered outside RepShell (tests, the admin area). */
export const useOptionalRepContext = () => useContext(RepContext);

/** Sidebar badges (REP_PORTAL_SPEC 3.2): refreshed every minute and when the window regains focus. */
export function usePortalNavCounts(scope: RepContextValue["scope"]) {
  const api = useApi();
  const qs = scope ? new URLSearchParams(scope).toString() : "";
  return useQuery({
    queryKey: ["portal", "nav-counts", qs],
    queryFn: () => api<PortalNavCounts>(`/portal/nav-counts?${qs}`),
    enabled: Boolean(scope),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
}
