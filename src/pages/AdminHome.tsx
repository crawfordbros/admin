import { useUser } from "@clerk/clerk-react";
import { Link } from "react-router-dom";
import { useAdminPage } from "../components/admin/adminPage";
import { Icon } from "../components/icons";
import { greeting, longDay } from "../lib/format";
import { ADMIN_NAV } from "./adminSections";

// Until the Overview aggregates ship (ADMIN_PORTAL_SPEC milestone M7), the page greets and
// points to each section. No numbers are shown that the API doesn't supply.
export function AdminHome() {
  const { user } = useUser();
  useAdminPage("Overview");

  return (
    <>
      <div>
        <p className="m-0 mb-1 text-[13px] font-bold tracking-[0.12em] text-gold-text uppercase">{longDay()}</p>
        <h1 className="m-0 text-[26px] font-bold text-navy-ink sm:text-[30px]">
          {greeting()}
          {user?.firstName ? `, ${user.firstName}` : ""}
        </h1>
        <p className="mt-1.5 mb-0 text-[15px] text-muted">Tonight's service, open reports and new quote requests will show here as each section comes online.</p>
      </div>

      {ADMIN_NAV.map((g) => (
        <section key={g.group} aria-labelledby={`home-${g.group}`}>
          <h2 id={`home-${g.group}`} className="m-0 mb-3 text-lg text-navy-ink">
            {g.group}
          </h2>
          <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4 p-0">
            {g.items
              .filter((s) => s.path !== "/admin")
              .map((s) => (
                <li key={s.path}>
                  <Link
                    to={s.path}
                    className="flex h-full gap-3.5 rounded-[14px] border border-line bg-white p-[18px] text-ink no-underline hover:border-navy/40 hover:text-ink"
                  >
                    <span className="flex size-9 flex-none items-center justify-center rounded-[10px] bg-tint-2 text-navy">
                      <Icon name={s.icon} size={19} />
                    </span>
                    <span className="min-w-0">
                      <span className="block font-heading text-[16px] font-bold text-navy-ink">{s.label}</span>
                      <span className="mt-0.5 block text-[13.5px] leading-relaxed text-muted">{s.detail}</span>
                    </span>
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </>
  );
}
