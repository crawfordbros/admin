import { Link } from "react-router-dom";
import { isAdmin, type Role } from "../../access";
import { useSignOut } from "../../components/account/account";
import { Icon, type IconName } from "../../components/steward/icons";
import { Avatar, Panel, Segmented } from "../../components/steward/ui";
import { ROLE_KEY, useCrewProfile, useUpdateProfile, type CrewProfile } from "../../lib/steward/crew";
import { displayPhone } from "../../lib/steward/phone";
import { clearOfflineCopies } from "../../lib/steward/offline";
import { useStewardPreferences, type ThemePreference } from "../../lib/steward/preferences";
import type { Locale } from "../../lib/steward/strings";
import { useScreenTitle } from "./useScreenTitle";

/**
 * Screen 14, Profile (docs/design/steward/Steward-Profile): photo, name, role and start date, Steward,
 * this week's shifts, hours, violations and issues fixed, properties, check-in history, phone and texts,
 * appearance, language, sign-in methods and sign out.
 */
export function MePage() {
  const { t, locale, setLocale, themePreference, setThemePreference } = useStewardPreferences();
  const profile = useCrewProfile().data!;
  const update = useUpdateProfile();
  const signOut = useSignOut();
  useScreenTitle(t("me.title"));
  const since = new Intl.DateTimeFormat(locale === "es" ? "es-US" : "en-US", { month: "short", year: "numeric" }).format(new Date(profile.startedAt));
  const name = profile.name || profile.email;
  const crew = profile.role === "valet" || profile.role === "lead";

  const changeLanguage = (next: Locale) => {
    setLocale(next);
    update.mutate({ locale: next });
  };

  return (
    <div className="flex flex-col gap-3 pt-5">
      <section className="flex items-center gap-3.5">
        <Link to="/steward/me/profile" className="relative flex-none rounded-full">
          <span className="sr-only">{t("me.changePhoto")}</span>
          <Avatar name={name} photoUrl={profile.photoUrl} size={76} />
          <span aria-hidden="true" className="absolute -right-1 -bottom-0.5 flex size-8 items-center justify-center rounded-full border-[3px] border-st-bg bg-st-cta text-st-on-cta">
            <Icon name="camera" size={15} strokeWidth={2.2} />
          </span>
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="m-0 truncate text-[23px] leading-tight font-bold">{name}</h1>
          <p className="mt-0.5 mb-0 text-[13.5px] font-bold text-st-accent">{t("me.since", { role: t(ROLE_KEY[profile.role]), date: since })}</p>
          {profile.steward && <p className="mt-0.5 mb-0 truncate text-[12.5px] text-st-text-2">{t("me.steward", { name: profile.steward.name })}</p>}
        </div>
        {crew && (
          <Link to="/steward/me/profile" className="flex min-h-10 items-center rounded-[10px] border border-st-border px-3 text-[13px] font-bold text-st-text no-underline hover:text-st-text">
            {t("me.edit")}
          </Link>
        )}
      </section>

      {isAdmin(profile.role as Role) && (
        <p role="note" className="m-0 rounded-xl bg-st-info-bg px-3.5 py-2.5 text-[13.5px] font-semibold text-st-info">
          {t("me.preview")}
        </p>
      )}

      {crew && profile.week && <WeekStats week={profile.week} />}

      {crew && (
        <Panel className="px-4 py-3">
          <h2 className="m-0 text-[15px] font-bold">{t("me.properties")}</h2>
          {profile.properties.length === 0 ? (
            <p className="mt-2 mb-0 text-[13.5px] text-st-text-2">{t("me.propertiesNone")}</p>
          ) : (
            <ul className="mt-2 mb-0 list-none p-0">
              {profile.properties.map((p) => (
                <li key={p.id} className="border-t border-st-track py-2.5">
                  <strong className="block text-[14.5px]">{p.name}</strong>
                  <span className="text-[12.5px] text-st-text-2">
                    {t(ROLE_KEY[p.role])} · {p.buildings.length ? t("me.buildings", { list: p.buildings.join(", ") }) : t("me.allBuildings")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      <Panel className="px-4 py-1">
        {crew && (
          <>
            <Row to="/steward/me/check-ins" icon="tonight" label={t("me.history")} value={profile.week ? t("me.historyValue", { n: profile.week.shifts }) : ""} />
            <Row to="/steward/me/contact" icon="phone" label={t("me.phone")} value={profile.phone ? displayPhone(profile.phone) : t("me.phoneNone")} />
            <Row to="/steward/me/contact" icon="issues" label={t("me.texts")} value={profile.smsOptIn ? t("me.on") : t("me.off")} />
          </>
        )}
        <Row to="/portal/settings" icon="key" label={t("me.signInMethods")} value={t("me.signInMethodsHint")} />
        <button type="button" onClick={() => { clearOfflineCopies(); signOut(); }} className="flex min-h-[52px] w-full items-center gap-3 bg-transparent p-0 text-left text-[14.5px] font-bold text-st-bad">
          <Icon name="signOut" size={20} />
          {t("me.signOut")}
        </button>
      </Panel>

      <Panel className="flex flex-col gap-3">
        <h2 className="m-0 text-[15px] font-bold">{t("me.appearance")}</h2>
        <Segmented<ThemePreference>
          label={t("me.appearance")}
          value={themePreference}
          onChange={setThemePreference}
          options={[
            { value: "system", label: t("me.theme.system") },
            { value: "light", label: t("me.theme.light") },
            { value: "dark", label: t("me.theme.dark") },
          ]}
        />
        <h2 className="mt-1 mb-0 text-[15px] font-bold">{t("me.language")}</h2>
        <Segmented<Locale>
          label={t("me.language")}
          value={locale}
          onChange={changeLanguage}
          options={[
            { value: "en", label: t("lang.en") },
            { value: "es", label: t("lang.es") },
          ]}
        />
      </Panel>
    </div>
  );
}

/** This week's four numbers, as tiles (the design's stats row). */
function WeekStats({ week }: { week: NonNullable<CrewProfile["week"]> }) {
  const { t, locale } = useStewardPreferences();
  const number = new Intl.NumberFormat(locale === "es" ? "es-US" : "en-US", { maximumFractionDigits: 1 });
  const stats: [string, string][] = [
    [number.format(week.shifts), t("me.stat.shifts")],
    [number.format(week.hours), t("me.stat.hours")],
    [number.format(week.violations), t("me.stat.violations")],
    [number.format(week.issuesFixed), t("me.stat.issuesFixed")],
  ];
  return (
    <section aria-labelledby="me-week">
      <h2 id="me-week" className="sr-only">
        {t("me.week")}
      </h2>
      <dl className="m-0 grid grid-cols-4 gap-2">
        {stats.map(([value, label]) => (
          <div key={label} className="flex flex-col-reverse rounded-xl bg-st-surface px-2 py-2.5 text-center">
            <dt className="text-[11px] leading-tight text-st-text-2">{label}</dt>
            <dd className="m-0 text-xl font-bold">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Row({ to, icon, label, value }: { to: string; icon: IconName; label: string; value: string }) {
  return (
    <Link to={to} className="flex min-h-[52px] items-center justify-between gap-3 border-b border-st-track text-[14.5px] text-st-text no-underline hover:text-st-text">
      <span className="flex items-center gap-3">
        <Icon name={icon} size={20} className="text-st-text-3" />
        {label}
      </span>
      <span className="flex min-w-0 items-center gap-2 text-[13.5px] text-st-text-2">
        <span className="truncate max-sm:max-w-[9rem]">{value}</span>
        <Icon name="chevron" size={16} strokeWidth={2.2} className="flex-none text-st-text-3" />
      </span>
    </Link>
  );
}
