import { Link, matchPath, useLocation } from "react-router-dom";
import { propertyPath } from "../../pages/admin/paths";
import { useManagerPreview } from "../../lib/preview";
import { AccountMenu } from "../account/AccountMenu";
import { PortalPageProvider, useAdminCrumbs, type Crumb } from "../admin/adminPage";
import { Notifications } from "../admin/Notifications";
import { SearchPalette, type PalettePage } from "../admin/SearchPalette";
import { Icon } from "../icons";
import { Breadcrumb, MenuButton, SearchButtons, SidebarLayout } from "../layout/SidebarLayout";
import { topbarClass } from "../layout/layoutStyles";
import { RepContextProvider, useRepContext, useRepNav } from "./RepContext";
import { RepSidebar } from "./RepSidebar";

// The Property Portal layout (REP_PORTAL_SPEC 4.2): the Admin Portal's geometry with the property
// side's sidebar, for every /portal page except sign-in and accepting an invitation.

const SECTIONS: [pattern: string, label: string][] = [
  ["/portal/organizations/:orgId/settings", "Team and settings"],
  ["/portal/organizations/:orgId/*", "Dashboard"],
  ["/portal/properties/:propertyId/report", "Weekly report"],
  ["/portal/violations/*", "Violations"],
  ["/portal/issues/*", "Resident issues"],
  ["/portal/reports", "Reports"],
  ["/portal/account", "My account"],
  ["/portal/settings", "Account settings"],
];

/** The page's section when the page doesn't set its own breadcrumb. */
function sectionCrumbs(pathname: string, kind: string): Crumb[] {
  const hit = SECTIONS.find(([pattern]) => matchPath(pattern, pathname));
  if (hit) return [{ label: hit[1] }];
  if (matchPath("/portal/properties/:propertyId", pathname) && kind === "property") return [{ label: "My property" }];
  return [];
}

function RepTopbar({ onMenu, onSearch }: { onMenu: () => void; onSearch: () => void }) {
  const { pathname } = useLocation();
  const { kind, org, property, homePath } = useRepContext();
  const crumbs = useAdminCrumbs() ?? sectionCrumbs(pathname, kind);
  const root = { label: (kind === "property" ? property?.name : org?.name) ?? "Property Portal", to: homePath };
  return (
    <header className={topbarClass}>
      <MenuButton onClick={onMenu} />
      <Breadcrumb root={root} crumbs={crumbs} />
      {kind !== "none" && (
        <SearchButtons onClick={onSearch} placeholder={kind === "organization" ? "Search properties, units, violation IDs…" : "Search units, violation IDs, issues…"} />
      )}
      <Notifications />
      <AccountMenu settingsPath="/portal/settings" />
    </header>
  );
}

/** Super Admins previewing a property (?as=manager) see what its manager sees, read-only. */
function PreviewBanner() {
  const preview = useManagerPreview();
  const { property } = useRepContext();
  if (!preview.on || !property) return null;
  return (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-gold-tint px-4 py-2 text-[13.5px] text-gold-text lg:px-7 print:hidden">
      <Icon name="eye" size={16} />
      <span className="min-w-0 flex-1 font-semibold">Previewing as a property manager. Changes are turned off.</span>
      <Link to={propertyPath(property.organizationId, property.id)} className="font-bold text-gold-text">
        Exit preview
      </Link>
    </div>
  );
}

function Palette({ onClose }: { onClose: () => void }) {
  const { kind, org, property } = useRepContext();
  const groups = useRepNav();
  if (kind === "none") return null;
  const ctx = { orgId: org?.id ?? "", propertyId: property?.id ?? "" };
  const pages: PalettePage[] = groups.flatMap((g) => g.items.flatMap((i) => (i.to ? [{ path: i.to(ctx), label: i.label, detail: i.detail }] : [])));
  return <SearchPalette mode="portal" pages={pages} onClose={onClose} />;
}

export function RepShell() {
  return (
    <PortalPageProvider>
      <RepContextProvider>
        <SidebarLayout
          sidebar={(onNavigate) => <RepSidebar onNavigate={onNavigate} />}
          banner={<PreviewBanner />}
          topbar={(actions) => <RepTopbar {...actions} />}
          palette={(onClose) => <Palette onClose={onClose} />}
        />
      </RepContextProvider>
    </PortalPageProvider>
  );
}
