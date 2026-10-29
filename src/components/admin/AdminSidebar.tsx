import { Link, NavLink } from "react-router-dom";
import { config } from "../../config";
import type { NavCounts } from "../../lib/api";
import { useNavCounts } from "./useNavCounts";
import { ADMIN_NAV, type AdminNavItem } from "../../pages/adminSections";
import { Icon } from "../icons";
import { cx } from "../styles";

// Count pills use danger red, not the design's #E04F3A: white 11 px text needs 4.5:1 (AA).
function Badge({ item, counts }: { item: AdminNavItem; counts: NavCounts | undefined }) {
  const pill = "rounded-full px-2 py-0.5 text-[11px] leading-[1.4] font-bold";
  if (item.tag) return <span className={cx(pill, "bg-nav-line text-nav-pill")}>{item.tag}</span>;
  const n = item.badge && counts?.[item.badge];
  if (!n) return null;
  return (
    <>
      <span aria-hidden="true" className={cx(pill, item.badgeTone === "gold" ? "bg-gold text-white" : "bg-danger text-white")}>
        {n > 99 ? "99+" : n}
      </span>
      <span className="sr-only">
        , {n} {item.badge === "openReports" ? "open" : "new"}
      </span>
    </>
  );
}

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
          <h2 className={cx("mx-2.5 mb-1.5 font-sans text-[11px] font-bold tracking-[0.12em] text-nav-label uppercase", gi === 0 ? "mt-2" : "mt-[18px]")}>{g.group}</h2>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {g.items.map((item) => (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  end={item.path === "/admin"}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cx(
                      "flex min-h-[42px] items-center gap-3 rounded-[10px] px-3 text-[14.5px] font-semibold no-underline",
                      isActive ? "bg-white text-navy-ink hover:text-navy-ink" : "text-on-navy hover:bg-white/10 hover:text-white",
                    )
                  }
                >
                  <Icon name={item.icon} />
                  <span className="flex-1">{item.label}</span>
                  <Badge item={item} counts={counts} />
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
