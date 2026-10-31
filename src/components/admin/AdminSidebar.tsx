import { Link, NavLink } from "react-router-dom";
import { config } from "../../config";
import type { NavCounts } from "../../lib/api";
import { useNavCounts } from "./useNavCounts";
import { ADMIN_NAV, type AdminNavItem } from "../../pages/adminSections";
import { Icon } from "../icons";
import { NavBadge, NavLabel } from "../layout/SidebarLayout";
import { navGroupClass, navItemClass } from "../layout/layoutStyles";

const badgeText = (item: AdminNavItem, counts: NavCounts | undefined) => {
  const n = item.badge ? counts?.[item.badge] : undefined;
  return n ? `${n} ${item.badge === "openReports" ? "open" : "new"}` : undefined;
};

export function AdminSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { data: counts } = useNavCounts();

  return (
    <nav aria-label="Admin Portal" className="flex min-h-full flex-col gap-1 bg-navy-ink px-3.5 py-5 text-on-navy">
      <Link to="/admin" onClick={onNavigate} className="flex items-center gap-3 px-2 pt-1 pb-5 text-white no-underline hover:text-white">
        <img src={`${import.meta.env.BASE_URL}logo-gold-on-navy.webp`} alt="" width={240} height={205} className="h-11 w-auto" />
        <span className="flex flex-col leading-tight">
          <span className="font-heading text-[17px] font-bold">Admin Portal</span>
          <span className="text-[12px] text-gold-light">CBES operations</span>
        </span>
      </Link>

      {ADMIN_NAV.map((g, gi) => (
        <div key={g.group} className="flex flex-col gap-1">
          <h2 className={navGroupClass(gi === 0)}>{g.group}</h2>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {g.items.map((item) => (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  end={item.path === "/admin"}
                  onClick={onNavigate}
                  className={({ isActive }) => navItemClass(isActive)}
                >
                  <Icon name={item.icon} />
                  <NavLabel label={item.label} srText={badgeText(item, counts)} />
                  <NavBadge tag={item.tag} count={item.badge ? counts?.[item.badge] : undefined} tone={item.badgeTone === "gold" ? "gold" : "alert"} />
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <div aria-hidden="true" className="min-h-6 flex-1" />
      <div className="flex flex-col gap-2.5 border-t border-nav-line px-2.5 pt-3.5 text-[13px]">
        <a href={config.siteUrl || "/"} className="flex items-center gap-2.5 text-gold-light no-underline hover:text-white">
          <Icon name="external" size={18} />
          View website
        </a>
        <span className="text-nav-label">Aiming for Excellence</span>
      </div>
    </nav>
  );
}
