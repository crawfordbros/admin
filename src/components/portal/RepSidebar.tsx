import { Link, NavLink } from "react-router-dom";
import { Icon } from "../icons";
import { NavBadge, NavLabel } from "../layout/SidebarLayout";
import { navGroupClass, navItemClass } from "../layout/layoutStyles";
import { cx } from "../styles";
import { ContextSwitcher } from "./ContextSwitcher";
import { BADGE_TEXT } from "./repNav";
import { usePortalNavCounts, useRepContext, useRepNav } from "./RepContext";

export function RepSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { org, property, kind, homePath, scope } = useRepContext();
  const groups = useRepNav();
  const { data: counts } = usePortalNavCounts(scope);
  const ctx = { orgId: org?.id ?? "", propertyId: property?.id ?? "" };
  // Until the context is known, links that need it wait rather than point nowhere.
  const ready = kind === "none" || Boolean(kind === "organization" ? org : property);

  return (
    <nav aria-label="Property Portal" className="flex min-h-full flex-col gap-1 bg-navy-ink px-3.5 py-5 text-on-navy">
      <Link to={homePath} onClick={onNavigate} className="flex items-center gap-3 px-2 pt-1 pb-[18px] text-white no-underline hover:text-white">
        <img src={`${import.meta.env.BASE_URL}logo-gold-on-navy.webp`} alt="" width={240} height={205} className="h-11 w-auto" />
        <span className="flex flex-col leading-tight">
          <span className="font-heading text-[17px] font-bold">Property Portal</span>
          <span className="text-[12px] text-gold-light">by CB Environment Solutions</span>
        </span>
      </Link>

      <ContextSwitcher onNavigate={onNavigate} />

      {ready &&
        groups.map((g, gi) => (
          <div key={g.group} className="flex flex-col gap-1">
            <h2 className={navGroupClass(gi === 0)}>{g.group}</h2>
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {g.items.map((item) => {
                const n = item.badge ? counts?.[item.badge] : undefined;
                const badge = <NavBadge tag={item.tag} count={n} tone={item.badgeTone} />;
                const label = <NavLabel label={item.label} srText={item.badge && n ? BADGE_TEXT[item.badge](n) : undefined} />;
                return (
                  <li key={item.label}>
                    {item.to ? (
                      <NavLink to={item.to(ctx)} end={item.end} onClick={onNavigate} className={({ isActive }) => navItemClass(isActive)}>
                        <Icon name={item.icon} />
                        {label}
                        {badge}
                      </NavLink>
                    ) : (
                      <span aria-disabled="true" className={cx(navItemClass(false), "cursor-default text-nav-pill hover:bg-transparent hover:text-nav-pill")}>
                        <Icon name={item.icon} />
                        {label}
                        {badge}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

      <div aria-hidden="true" className="min-h-6 flex-1" />
      <div className="flex flex-col gap-2.5 border-t border-nav-line px-2.5 pt-3.5 text-[13px]">
        <div className="flex flex-col gap-1 rounded-xl bg-nav-card p-3">
          <span className="font-bold text-white">Need CBES?</span>
          <span className="text-[12.5px] text-nav-pill">We reply within 24 hours.</span>
          <a href="mailto:office@cbenvironments.com" className="text-[12px] font-bold break-all text-gold-light no-underline hover:text-white">
            office@cbenvironments.com
          </a>
        </div>
        <span className="text-nav-label">Aiming for Excellence</span>
      </div>
    </nav>
  );
}
