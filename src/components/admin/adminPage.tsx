/* eslint-disable react-refresh/only-export-components -- the provider and its hook belong together */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Crumb = { label: string; to?: string; description?: string };

type Ctx = { crumbs: Crumb[] | null; setCrumbs: (crumbs: Crumb[] | null) => void; suffix: string };
const AdminPageContext = createContext<Ctx | null>(null);

/** Holds the page's breadcrumb for the top bar. `suffix` ends every tab title in this area. */
export function AdminPageProvider({ children, suffix = "CBES Admin" }: { children: ReactNode; suffix?: string }) {
  const [crumbs, setCrumbs] = useState<Crumb[] | null>(null);
  return <AdminPageContext.Provider value={{ crumbs, setCrumbs, suffix }}>{children}</AdminPageContext.Provider>;
}

/** The Property Portal's provider: titles end "| CBES Portal". */
export const PortalPageProvider = ({ children }: { children: ReactNode }) => <AdminPageProvider suffix="CBES Portal">{children}</AdminPageProvider>;

export const useAdminCrumbs = () => useContext(AdminPageContext)?.crumbs ?? null;

/**
 * Sets the tab title ("{title} | CBES Admin", or "| CBES Portal" in the Property Portal) and, when
 * given, the breadcrumb after the area's root. Without crumbs the top bar shows the sidebar section.
 */
export function useAdminPage(title: string | null, crumbs?: Crumb[], fallbackSuffix = "CBES Admin") {
  const ctx = useContext(AdminPageContext);
  const setCrumbs = ctx?.setCrumbs;
  const suffix = ctx?.suffix ?? fallbackSuffix;
  const key = crumbs ? JSON.stringify(crumbs) : null;

  useEffect(() => {
    if (title) document.title = `${title} | ${suffix}`;
  }, [title, suffix]);

  useEffect(() => {
    if (!setCrumbs || !key) return;
    setCrumbs(JSON.parse(key) as Crumb[]);
    return () => setCrumbs(null);
  }, [setCrumbs, key]);
}

/** The same for Property Portal pages; titles end "| CBES Portal" even outside RepShell. */
export const usePortalPage = (title: string | null, crumbs?: Crumb[]) => useAdminPage(title, crumbs, "CBES Portal");
