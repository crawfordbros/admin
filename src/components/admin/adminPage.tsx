/* eslint-disable react-refresh/only-export-components -- the provider and its hook belong together */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Crumb = { label: string; to?: string };

type Ctx = { crumbs: Crumb[] | null; setCrumbs: (crumbs: Crumb[] | null) => void };
const AdminPageContext = createContext<Ctx | null>(null);

export function AdminPageProvider({ children }: { children: ReactNode }) {
  const [crumbs, setCrumbs] = useState<Crumb[] | null>(null);
  return <AdminPageContext.Provider value={{ crumbs, setCrumbs }}>{children}</AdminPageContext.Provider>;
}

export const useAdminCrumbs = () => useContext(AdminPageContext)?.crumbs ?? null;

/**
 * Sets the tab title ("{title} | CBES Admin") and, when given, the breadcrumb after
 * "Admin Portal". Without crumbs the top bar shows the sidebar section. Pages shared with the
 * portal can call it too: outside the Admin Portal it only skips the breadcrumb.
 */
export function useAdminPage(title: string | null, crumbs?: Crumb[]) {
  const ctx = useContext(AdminPageContext);
  const setCrumbs = ctx?.setCrumbs;
  const key = crumbs ? JSON.stringify(crumbs) : null;

  useEffect(() => {
    if (title) document.title = `${title} | CBES Admin`;
  }, [title]);

  useEffect(() => {
    if (!setCrumbs || !key) return;
    setCrumbs(JSON.parse(key) as Crumb[]);
    return () => setCrumbs(null);
  }, [setCrumbs, key]);
}
