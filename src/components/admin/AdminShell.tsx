import { Suspense, useEffect, useRef, useState } from "react";
import { UserButton, useUser } from "@clerk/clerk-react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { ROLE_LABELS, roleFrom } from "../../access";
import { sectionFor } from "../../pages/adminSections";
import { Icon } from "../icons";
import { Loading } from "../ui";
import { useFocusTrap } from "../useFocusTrap";
import { AdminPageProvider, useAdminCrumbs, type Crumb } from "./adminPage";
import { AdminSidebar } from "./AdminSidebar";
import { Notifications } from "./Notifications";
import { SearchPalette } from "./SearchPalette";

// The Admin Portal layout (ADMIN_PORTAL_SPEC section 4.2): a navy sidebar from 1024 px up
// (a slide-over drawer below that), a sticky top bar and the page on a light canvas.

function Breadcrumb() {
  const { pathname } = useLocation();
  const section = sectionFor(pathname);
  const crumbs: Crumb[] = useAdminCrumbs() ?? (section ? [{ label: section.label }] : []);
  return (
    <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
      <ol className="m-0 flex list-none items-center gap-1.5 overflow-hidden p-0 text-[14px] whitespace-nowrap text-muted">
        <li className="hidden sm:block">
          <Link to="/admin" className="text-muted no-underline hover:text-navy hover:underline">
            Admin Portal
          </Link>
        </li>
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={`${c.label}-${i}`} className={last ? "flex min-w-0 items-center gap-1.5" : "hidden items-center gap-1.5 sm:flex"}>
              <span aria-hidden="true" className={i === 0 ? "hidden text-placeholder sm:inline" : "text-placeholder"}>
                /
              </span>
              {last || !c.to ? (
                <strong aria-current={last ? "page" : undefined} className="truncate text-ink">
                  {c.label}
                </strong>
              ) : (
                <Link to={c.to} className="text-muted no-underline hover:text-navy hover:underline">
                  {c.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function UserBlock() {
  const { user } = useUser();
  const role = roleFrom(user?.publicMetadata);
  return (
    <div className="flex flex-none items-center gap-2.5">
      <UserButton appearance={{ elements: { avatarBox: { width: 38, height: 38 } } }} />
      <span className="hidden flex-col leading-tight md:flex">
        <span className="text-[14px] font-bold">{user?.fullName ?? user?.primaryEmailAddress?.emailAddress}</span>
        {role && <span className="text-[12px] font-semibold text-gold-text">{ROLE_LABELS[role]}</span>}
      </span>
    </div>
  );
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

function Topbar({ onMenu, onSearch }: { onMenu: () => void; onSearch: () => void }) {
  return (
    <header className="sticky top-0 z-30 flex min-h-16 items-center gap-3 border-b border-line bg-white px-4 py-2.5 sm:gap-4 lg:px-7 print:hidden">
      <button type="button" aria-label="Open menu" onClick={onMenu} className="flex size-10 flex-none items-center justify-center rounded-[10px] border border-line text-ink hover:bg-canvas lg:hidden">
        <Icon name="menu" />
      </button>
      <Breadcrumb />
      <button
        type="button"
        onClick={onSearch}
        aria-keyshortcuts={isMac ? "Meta+K" : "Control+K"}
        className="hidden h-10 flex-[0_1_380px] items-center gap-2 rounded-[10px] border border-line bg-canvas px-3 text-left text-[14px] text-muted hover:border-field md:flex"
      >
        <Icon name="search" size={18} strokeWidth={2} />
        <span className="flex-1 truncate">Search orgs, properties, units, tickets…</span>
        <kbd className="rounded-md border border-field bg-white px-1.5 py-px font-sans text-[11px] text-muted">{isMac ? "⌘K" : "Ctrl K"}</kbd>
      </button>
      <button type="button" aria-label="Search" onClick={onSearch} className="flex size-10 flex-none items-center justify-center rounded-[10px] border border-line text-ink hover:bg-canvas md:hidden">
        <Icon name="search" strokeWidth={2} />
      </button>
      <Notifications />
      <UserBlock />
    </header>
  );
}

function MobileNav({ onClose }: { onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  useFocusTrap(panel, onClose);
  return (
    <div className="anim-fade fixed inset-0 z-50 bg-navy-night/60 lg:hidden" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panel} role="dialog" aria-modal="true" aria-label="Menu" className="anim-sheet relative h-full w-[min(300px,86vw)] overflow-y-auto bg-navy-ink">
        <button type="button" aria-label="Close menu" onClick={onClose} className="absolute top-4 right-3 z-10 flex size-10 items-center justify-center rounded-[10px] border border-navy-soft text-white hover:bg-white/10">
          <Icon name="x" size={18} strokeWidth={2.2} />
        </button>
        <AdminSidebar onNavigate={onClose} />
      </div>
    </div>
  );
}

export function AdminShell() {
  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearch(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // A new page starts at the top, like a full page load.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <AdminPageProvider>
      <div className="flex min-h-dvh bg-canvas text-ink print:block print:bg-white">
        <a href="#main" className="sr-only z-[70] rounded-lg bg-white px-4 py-2 font-bold focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
          Skip to content
        </a>
        <div className="hidden w-[248px] flex-none bg-navy-ink lg:block print:hidden">
          <div className="sticky top-0 h-dvh overflow-y-auto">
            <AdminSidebar />
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar onMenu={() => setMenu(true)} onSearch={() => setSearch(true)} />
          <main id="main" tabIndex={-1} className="flex flex-1 flex-col gap-6 px-4 pt-6 pb-14 focus:outline-none sm:px-6 lg:px-8 lg:pt-7 print:p-0">
            <Suspense fallback={<Loading />}>
              <Outlet />
            </Suspense>
          </main>
        </div>
      </div>
      {menu && <MobileNav onClose={() => setMenu(false)} />}
      {search && <SearchPalette onClose={() => setSearch(false)} />}
    </AdminPageProvider>
  );
}
