import { UserButton, useUser } from "@clerk/clerk-react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { canAccess, roleFrom } from "../access";
import { config } from "../config";
import { ADMIN_SECTIONS } from "../pages/adminSections";

function AdminNav() {
  const tab = ({ isActive }: { isActive: boolean }) =>
    [
      "flex min-h-11 flex-none items-center rounded-lg px-3.5 text-[15px] font-semibold no-underline whitespace-nowrap",
      isActive ? "bg-navy text-white hover:text-white" : "text-ink hover:bg-tint",
    ].join(" ");
  return (
    <nav aria-label="Admin" className="border-b border-line bg-white lg:w-60 lg:flex-none lg:border-r lg:border-b-0 print:hidden">
      {/* Phones: one scrollable row of tabs. Desktop: a sidebar. */}
      <ul className="m-0 flex list-none gap-1 overflow-x-auto p-2 lg:flex-col lg:p-4">
        {ADMIN_SECTIONS.map((s) => (
          <li key={s.path}>
            <NavLink to={s.path} end={s.path === "/admin"} className={tab}>
              {s.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function Shell() {
  const { user } = useUser();
  const { pathname } = useLocation();
  const role = roleFrom(user?.publicMetadata);
  const inAdmin = pathname.startsWith("/admin") && canAccess(role, "admin");

  return (
    <div className="flex min-h-dvh flex-col bg-surface print:bg-white">
      <header className="bg-navy text-white print:hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-2 sm:px-6">
          <Link to="/portal" className="flex items-center gap-3 text-white no-underline hover:text-white">
            <img src={`${import.meta.env.BASE_URL}logo-gold-on-navy.webp`} alt="" width={240} height={183} className="h-11 w-auto" />
            <span className="font-heading text-lg font-bold">{inAdmin ? "Admin" : "Portal"}</span>
          </Link>
          <div className="flex items-center gap-4">
            {canAccess(role, "admin") && (
              <NavLink
                to={inAdmin ? "/portal" : "/admin"}
                className="hidden text-[15px] font-semibold text-white no-underline hover:text-gold-light sm:inline"
              >
                {inAdmin ? "Portal" : "Admin"}
              </NavLink>
            )}
            <a href={config.siteUrl || "/"} className="hidden text-[15px] font-semibold text-gold-light no-underline hover:text-white sm:inline">
              Website
            </a>
            <UserButton />
          </div>
        </div>
      </header>
      <div className="flex flex-1 flex-col lg:flex-row">
        {inAdmin && <AdminNav />}
        <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-6 sm:py-8 print:p-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
