import { useLocation } from "react-router-dom";
import { sectionFor } from "../../pages/adminSections";
import { AccountMenu } from "../account/AccountMenu";
import { Breadcrumb, MenuButton, SearchButtons, SidebarLayout } from "../layout/SidebarLayout";
import { topbarClass } from "../layout/layoutStyles";
import { AdminPageProvider, useAdminCrumbs, type Crumb } from "./adminPage";
import { AdminSidebar } from "./AdminSidebar";
import { Notifications } from "./Notifications";
import { SearchPalette } from "./SearchPalette";

// The Admin Portal layout (ADMIN_PORTAL_SPEC section 4.2), on the layout it shares with the Property Portal.

function AdminBreadcrumb() {
  const { pathname } = useLocation();
  const section = sectionFor(pathname);
  const crumbs: Crumb[] = useAdminCrumbs() ?? (section ? [{ label: section.label }] : []);
  return <Breadcrumb root={{ label: "Admin Portal", to: "/admin" }} crumbs={crumbs} />;
}

export function AdminShell() {
  return (
    <AdminPageProvider>
      <SidebarLayout
        sidebar={(onNavigate) => <AdminSidebar onNavigate={onNavigate} />}
        topbar={({ onMenu, onSearch }) => (
          <header className={topbarClass}>
            <MenuButton onClick={onMenu} />
            <AdminBreadcrumb />
            <SearchButtons onClick={onSearch} placeholder="Search orgs, properties, units, tickets…" />
            <Notifications />
            <AccountMenu settingsPath="/admin/settings/account" />
          </header>
        )}
        palette={(onClose) => <SearchPalette onClose={onClose} />}
      />
    </AdminPageProvider>
  );
}
