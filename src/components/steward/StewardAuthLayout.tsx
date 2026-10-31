import type { ReactNode } from "react";
import { useStewardPreferences } from "../../lib/steward/preferences";
import type { Locale } from "../../lib/steward/strings";
import { cx } from "../styles";
import { AUTH_EN, AUTH_ES, AuthCopyContext } from "../../pages/auth/authCopy";

/**
 * The Steward sign-in and two-step screens (docs/design/steward/Steward-SignIn): language switch, the
 * crest and the app name, the shared sign-in steps, and the invite-only note at the foot.
 */
export function StewardAuthLayout({ children }: { children: ReactNode }) {
  const { t, theme, locale } = useStewardPreferences();
  const base = import.meta.env.BASE_URL;
  const logo = theme === "dark" ? { src: `${base}logo-gold-on-navy.webp`, w: 240, h: 205 } : { src: `${base}logo-blue-on-white.png`, w: 790, h: 679 };
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[28rem] flex-col px-6 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.75rem,env(safe-area-inset-bottom))]">
      <div className="flex justify-end">
        <LanguageSwitch />
      </div>
      <div className="mt-7 flex flex-col items-center text-center">
        <img src={logo.src} alt="CB Environment Solutions" width={logo.w} height={logo.h} className="h-[92px] w-auto" />
        <p className="mt-[18px] mb-0 font-heading text-[34px] leading-none font-bold tracking-[0.01em]">{t("app.name")}</p>
        <p className="mt-1.5 mb-0 text-[15px] text-st-text-2">{t("app.tagline")}</p>
      </div>
      <main className="steward-skin mt-9 [&_h1]:text-[1.4rem]">
        <AuthCopyContext.Provider value={locale === "es" ? AUTH_ES : AUTH_EN}>{children}</AuthCopyContext.Provider>
      </main>
      <aside className="mt-auto rounded-[14px] bg-st-surface px-4 py-3.5 text-[13.5px] leading-normal text-st-text-2 max-sm:mt-8 sm:mt-10">
        <strong className="mb-0.5 block text-st-text">{t("signin.newTitle")}</strong>
        {t("signin.newBody")}
      </aside>
    </div>
  );
}

/** EN / ES, as on the sign-in design. Changes the whole app's language on this device. */
export function LanguageSwitch() {
  const { t, locale, setLocale } = useStewardPreferences();
  const options: { value: Locale; label: string; name: string }[] = [
    { value: "en", label: "EN", name: t("lang.en") },
    { value: "es", label: "ES", name: t("lang.es") },
  ];
  return (
    <div role="group" aria-label={t("lang.group")} className="flex rounded-full bg-st-raised p-[3px]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          lang={o.value}
          aria-pressed={locale === o.value}
          aria-label={o.name}
          onClick={() => setLocale(o.value)}
          className={cx(
            "min-h-9 min-w-11 rounded-full px-3 text-[13px] font-bold",
            locale === o.value ? "bg-st-cta text-st-on-cta" : "text-st-text-2 hover:text-st-text",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
