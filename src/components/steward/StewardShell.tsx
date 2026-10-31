import { Suspense, useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { useUser } from "@clerk/clerk-react";
import { Link, NavLink, Navigate, Outlet, useLocation } from "react-router-dom";
import { canAccess, roleFrom } from "../../access";
import { useStewardPreferences, useT } from "../../lib/steward/preferences";
import { useCrewProfile, useUpdateProfile } from "../../lib/steward/crew";
import { useReview } from "../../lib/steward/violations";
import { cx } from "../styles";
import { Icon } from "./icons";
import { tabsFor, type Tab } from "./nav";
import { useCrewView } from "./useCrewView";
import { useCommandView } from "./useCommandView";
import { OutboxProvider } from "./OutboxProvider";
import { Avatar } from "./ui";

// The Steward app frame (STEWARD_APP_SPEC section 3, docs/design/steward/StewardTabBar and Steward-Tablet):
// a bottom tab bar on phones, a left rail from 768 px. Full-screen tasks (logging a violation, an issue)
// hide the tab bar on phones so the action buttons sit at the bottom edge.

/** The tab bar's height, so pinned actions and the page end clear it. */
const TABBAR = "calc(66px + max(18px, env(safe-area-inset-bottom)))";
const IMMERSIVE = /^\/steward\/(violations\/new|issues\/[^/]+|crew\/[^/]+|setup\/[^/]+|training\/[^/]+|me\/[^/]+)\/?$/;

export function StewardShell() {
  const { pathname } = useLocation();
  const view = useCrewView();
  const tabs = tabsFor(view);
  const immersive = IMMERSIVE.test(pathname);
  // The tablet command view uses the whole width beside the rail.
  const wide = useCommandView();
  // Onboarding has no navigation at all, on any screen size.
  const setup = pathname.startsWith("/steward/setup/");
  // Stewards see how many violations wait for review on the Review tab.
  const review = useReview(view === "steward");
  const badges: Partial<Record<Tab["key"], number>> = { review: review.data?.items.length ?? 0 };
  return (
    <div className={cx("min-h-dvh", !setup && "md:pl-24")} style={{ "--st-tabbar": immersive ? "0px" : TABBAR } as CSSProperties}>
      {!setup && <Rail tabs={tabs} badges={badges} />}
      <main
        id="main"
        className={cx(
          "mx-auto flex min-h-dvh w-full flex-col px-5 pt-[env(safe-area-inset-top)] pb-[calc(var(--st-tabbar)+12px)] md:px-8 md:pb-8",
          wide ? "max-w-[90rem]" : "max-w-[42rem]",
        )}
      >
        <Suspense fallback={<Loading />}>
          <CrewGate>
            <OutboxProvider>
              <Outlet />
            </OutboxProvider>
          </CrewGate>
        </Suspense>
      </main>
      {!immersive && <TabBar tabs={tabs} badges={badges} />}
    </div>
  );
}

function TabBar({ tabs, badges }: { tabs: Tab[]; badges: Partial<Record<Tab["key"], number>> }) {
  const t = useT();
  return (
    <nav
      aria-label={t("nav.label")}
      className="fixed inset-x-0 bottom-0 z-20 flex border-t border-st-track bg-st-chrome px-1.5 pt-2 md:hidden"
      style={{ paddingBottom: "max(18px, env(safe-area-inset-bottom))" }}
    >
      {tabs.map((tab) => (
        <NavLink
          key={tab.key}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) =>
            cx(
              "flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-xl text-[11.5px] font-bold no-underline",
              isActive ? "bg-st-raised text-st-text hover:text-st-text" : "text-st-text-3 hover:text-st-text",
            )
          }
        >
          <TabIcon tab={tab} count={badges[tab.key] ?? 0} />
          <span>
            {t(tab.label)}
            <BadgeText count={badges[tab.key] ?? 0} />
          </span>
        </NavLink>
      ))}
    </nav>
  );
}

function Rail({ tabs, badges }: { tabs: Tab[]; badges: Partial<Record<Tab["key"], number>> }) {
  const { t, theme } = useStewardPreferences();
  const { user } = useUser();
  const { data: profile } = useCrewProfile();
  const base = import.meta.env.BASE_URL;
  const name = profile?.name || user?.fullName?.trim() || user?.primaryEmailAddress?.emailAddress || "";
  return (
    <nav
      aria-label={t("nav.label")}
      className="fixed inset-y-0 left-0 z-20 hidden w-24 flex-col items-center gap-1.5 border-r border-st-track bg-st-chrome py-[18px] md:flex"
    >
      <img
        src={theme === "dark" ? `${base}logo-gold-on-navy.webp` : `${base}logo-blue-on-white.png`}
        alt="CB Environment Solutions"
        width={theme === "dark" ? 240 : 790}
        height={theme === "dark" ? 205 : 679}
        className="mb-3.5 h-[46px] w-auto"
      />
      {tabs
        .filter((tab) => tab.key !== "me")
        .map((tab) => (
          <NavLink
            key={tab.key}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              cx(
                "flex min-h-16 w-[76px] flex-col items-center justify-center gap-1 rounded-xl text-[11.5px] font-bold no-underline",
                isActive ? "bg-st-raised text-st-text hover:text-st-text" : "text-st-text-3 hover:text-st-text",
              )
            }
          >
            <TabIcon tab={tab} count={badges[tab.key] ?? 0} />
            <span>
            {t(tab.label)}
            <BadgeText count={badges[tab.key] ?? 0} />
          </span>
          </NavLink>
        ))}
      <NavLink
        to="/steward/me"
        className={({ isActive }) => cx("mt-auto rounded-full no-underline", isActive && "outline-2 outline-offset-2 outline-st-accent")}
      >
        <span className="sr-only">{t("nav.me")}</span>
        <Avatar name={name} photoUrl={profile?.photoUrl} size={48} />
      </NavLink>
    </nav>
  );
}

/** A tab's icon with its count, as on the designs' tab bar. */
function TabIcon({ tab, count }: { tab: Tab; count: number }) {
  return (
    <span className="relative flex">
      <Icon name={tab.key} />
      {count > 0 && (
        <span aria-hidden="true" className="absolute -top-1.5 -right-2.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-st-badge px-[5px] text-[11px] font-bold text-white">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </span>
  );
}

/** The count for screen readers after the tab's label: "Review (3 to review)". */
function BadgeText({ count }: { count: number }) {
  const t = useT();
  if (count <= 0) return null;
  return <span className="sr-only"> ({t("nav.reviewBadge", { count })})</span>;
}

function Loading() {
  const t = useT();
  return (
    <p role="status" className="py-16 text-center text-st-text-2">
      {t("app.loading")}
    </p>
  );
}

/**
 * Loads the crew profile. A valet or Steward without a photo and names goes to step 1 first (the API
 * refuses everything else until then). The app's language follows the profile unless it was chosen on
 * this device, in which case the profile follows the device.
 */
function CrewGate({ children }: { children: ReactNode }) {
  const t = useT();
  const { locale, localeChosen, setLocale } = useStewardPreferences();
  const { pathname } = useLocation();
  const profile = useCrewProfile();
  const update = useUpdateProfile();
  const synced = useRef(false);
  const data = profile.data;

  useEffect(() => {
    if (!data || synced.current) return;
    synced.current = true;
    if (data.locale === locale) return;
    if (localeChosen) update.mutate({ locale });
    else setLocale(data.locale);
  }, [data, locale, localeChosen, setLocale, update]);

  if (profile.isPending) return <Loading />;
  if (profile.error) {
    return (
      <div className="flex flex-col items-start gap-3 pt-16">
        <p role="alert" className="m-0 text-st-text-2">
          {t("error.load")}
        </p>
        <button type="button" onClick={() => void profile.refetch()} className="min-h-11 rounded-xl border border-st-border px-4 font-bold">
          {t("error.retry")}
        </button>
      </div>
    );
  }
  if (profile.data.needsOnboarding && pathname !== "/steward/setup/profile") return <Navigate to="/steward/setup/profile" replace />;
  return <>{children}</>;
}

/** Signed in with a crew role (or an admin previewing); otherwise says why not. */
export function StewardArea({ children }: { children: ReactNode }) {
  const { isLoaded, user } = useUser();
  const t = useT();
  if (!isLoaded) return <Loading />;
  const role = roleFrom(user?.publicMetadata);
  if (canAccess(role, "valet")) return <>{children}</>;
  return (
    <div className="mx-auto max-w-md px-5 pt-16">
      <section className="rounded-2xl bg-st-surface p-6">
        <h1 className="mt-0 mb-3 text-2xl font-bold">{role ? t("denied.title") : t("denied.noRoleTitle")}</h1>
        <p className="mb-5 leading-relaxed text-st-text-2">{role ? t("denied.body") : t("denied.noRole")}</p>
        {role && (
          <Link to="/portal" className="font-bold">
            {t("denied.portal")}
          </Link>
        )}
      </section>
    </div>
  );
}

/** Crew and Review are the Steward's. A valet who follows a link there lands on Tonight. */
export function StewardOnly({ children }: { children: ReactNode }) {
  return useCrewView() === "steward" ? <>{children}</> : <Navigate to="/steward" replace />;
}
