import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { Icon } from "../icons";
import { cx } from "../styles";
import { Loading } from "../ui";
import { useFocusTrap } from "../useFocusTrap";
import type { Crumb } from "../admin/adminPage";
import { isMac } from "./layoutStyles";

// The layout the Admin Portal and the Property Portal share (ADMIN_PORTAL_SPEC 4.2, REP_PORTAL_SPEC
// 4.2): a 248 px navy sidebar from 1024 px up (a slide-over drawer below that), a sticky top bar,
// ⌘K search and the page on a light canvas.

/**
 * A sidebar pill: a count (red, or gold for invitations and quotes) or a muted tag such as
 * "Phase 2". Count pills use danger red, not the design's #E04F3A: white 11 px text needs 4.5:1 (AA).
 * The count is hidden from screen readers; put what it means in the link's label (NavLabel).
 */
export function NavBadge({ count, tone = "alert", tag }: { count?: number; tone?: "alert" | "gold"; tag?: string }) {
  const pill = "rounded-full px-2 py-0.5 text-[11px] leading-[1.4] font-bold";
  if (tag) return <span className={cx(pill, "bg-nav-line text-nav-pill")}>{tag}</span>;
  if (!count) return null;
  return (
    <span aria-hidden="true" className={cx(pill, tone === "gold" ? "bg-gold text-white" : "bg-danger text-white")}>
      {count > 99 ? "99+" : count}
    </span>
  );
}

/** A sidebar link's text, with its badge read out right after it: "Violations, 3 to review". */
export function NavLabel({ label, srText }: { label: string; srText?: string }) {
  return (
    <span className="flex-1">
      {label}
      {srText && <span className="sr-only">, {srText}</span>}
    </span>
  );
}

/** "Root / section / item", each segment a link except the last. */
export function Breadcrumb({ root, crumbs }: { root: Crumb; crumbs: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
      <ol className="m-0 flex list-none items-center gap-1.5 overflow-hidden p-0 text-[14px] whitespace-nowrap text-muted">
        <li className={cx(crumbs.length ? "hidden sm:block" : "min-w-0 truncate")}>
          {root.to ? (
            <Link to={root.to} className="text-muted no-underline hover:text-navy hover:underline">
              {root.label}
            </Link>
          ) : (
            <strong className="text-ink">{root.label}</strong>
          )}
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

export function MenuButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" aria-label="Open menu" onClick={onClick} className="flex size-10 flex-none items-center justify-center rounded-[10px] border border-line text-ink hover:bg-canvas lg:hidden">
      <Icon name="menu" />
    </button>
  );
}

/** The top bar's search: a wide field-like button from 768 px up, an icon button below. */
export function SearchButtons({ onClick, placeholder }: { onClick: () => void; placeholder: string }) {
  return (
    <>
      <button
        type="button"
        onClick={onClick}
        aria-keyshortcuts={isMac ? "Meta+K" : "Control+K"}
        className="hidden h-10 flex-[0_1_380px] items-center gap-2 rounded-[10px] border border-line bg-canvas px-3 text-left text-[14px] text-muted hover:border-field md:flex"
      >
        <Icon name="search" size={18} strokeWidth={2} />
        <span className="flex-1 truncate">{placeholder}</span>
        <kbd className="rounded-md border border-field bg-white px-1.5 py-px font-sans text-[11px] text-muted">{isMac ? "⌘K" : "Ctrl K"}</kbd>
      </button>
      <button type="button" aria-label="Search" onClick={onClick} className="flex size-10 flex-none items-center justify-center rounded-[10px] border border-line text-ink hover:bg-canvas md:hidden">
        <Icon name="search" strokeWidth={2} />
      </button>
    </>
  );
}

function MobileNav({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  useFocusTrap(panel, onClose);
  return (
    <div className="anim-fade fixed inset-0 z-50 bg-navy-night/60 lg:hidden" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panel} role="dialog" aria-modal="true" aria-label="Menu" className="anim-sheet relative h-full w-[min(300px,86vw)] overflow-y-auto bg-navy-ink">
        <button type="button" aria-label="Close menu" onClick={onClose} className="absolute top-4 right-3 z-10 flex size-10 items-center justify-center rounded-[10px] border border-navy-soft text-white hover:bg-white/10">
          <Icon name="x" size={18} strokeWidth={2.2} />
        </button>
        {children}
      </div>
    </div>
  );
}

type Props = {
  /** The navigation, rendered in the desktop column and in the mobile drawer (with `onNavigate`). */
  sidebar: (onNavigate?: () => void) => ReactNode;
  topbar: (actions: { onMenu: () => void; onSearch: () => void }) => ReactNode;
  palette: (onClose: () => void) => ReactNode;
  /** A slim notice above the top bar, such as the manager preview banner. */
  banner?: ReactNode;
};

export function SidebarLayout({ sidebar, topbar, palette, banner }: Props) {
  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        // ⌘K again closes it, like most command palettes. Holding the keys down doesn't flicker it.
        if (!e.repeat) setSearch((open) => !open);
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
    <>
      <div className="flex min-h-dvh bg-canvas text-ink print:block print:bg-white">
        <a href="#main" className="sr-only z-[70] rounded-lg bg-white px-4 py-2 font-bold focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
          Skip to content
        </a>
        <div className="hidden w-[248px] flex-none bg-navy-ink lg:block print:hidden">
          <div className="sticky top-0 h-dvh overflow-y-auto">{sidebar()}</div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          {banner}
          {topbar({ onMenu: () => setMenu(true), onSearch: () => setSearch(true) })}
          <main id="main" tabIndex={-1} className="flex flex-1 flex-col gap-6 px-4 pt-6 pb-14 focus:outline-none sm:px-6 lg:px-8 lg:pt-7 print:p-0">
            <Suspense fallback={<Loading />}>
              <Outlet />
            </Suspense>
          </main>
        </div>
      </div>
      {menu && <MobileNav onClose={() => setMenu(false)}>{sidebar(() => setMenu(false))}</MobileNav>}
      {search && palette(() => setSearch(false))}
    </>
  );
}
