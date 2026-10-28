import { Suspense } from "react";
import { UserButton, useUser } from "@clerk/clerk-react";
import { Link, Outlet } from "react-router-dom";
import { canAccess, roleFrom } from "../access";
import { config } from "../config";
import { Loading } from "./ui";

/** The portal layout for property managers, Directors and representatives. Admins use AdminShell. */
export function Shell() {
  const { user } = useUser();
  const role = roleFrom(user?.publicMetadata);

  return (
    <div className="flex min-h-dvh flex-col bg-surface print:bg-white">
      <header className="bg-navy text-white print:hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-2 sm:px-6">
          <Link to="/portal" className="flex items-center gap-3 text-white no-underline hover:text-white">
            <img src={`${import.meta.env.BASE_URL}logo-gold-on-navy.webp`} alt="" width={240} height={183} className="h-11 w-auto" />
            <span className="font-heading text-lg font-bold">Portal</span>
          </Link>
          <div className="flex items-center gap-4">
            {canAccess(role, "admin") && (
              <Link to="/admin" className="hidden text-[15px] font-semibold text-white no-underline hover:text-gold-light sm:inline">
                Admin Portal
              </Link>
            )}
            <a href={config.siteUrl || "/"} className="hidden text-[15px] font-semibold text-gold-light no-underline hover:text-white sm:inline">
              Website
            </a>
            <UserButton />
          </div>
        </div>
      </header>
      <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-6 sm:py-8 print:p-0">
        <Suspense fallback={<Loading />}>
              <Outlet />
            </Suspense>
      </main>
    </div>
  );
}
