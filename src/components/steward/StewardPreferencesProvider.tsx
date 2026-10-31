import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { deviceLocale, PreferencesContext, resolveTheme, THEMES, type ThemePreference } from "../../lib/steward/preferences";
import { LOCALES, translate, type Locale, type StringKey } from "../../lib/steward/strings";

// Keeps the Steward app's language and appearance on this device.

const LOCALE_KEY = "steward.locale";
const THEME_KEY = "steward.theme";

function stored<T extends string>(key: string, allowed: readonly T[]): T | null {
  try {
    const value = localStorage.getItem(key);
    return value && (allowed as readonly string[]).includes(value) ? (value as T) : null;
  } catch {
    return null;
  }
}

function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode or storage full: the choice still applies until the page reloads.
  }
}

/** Spanish when the phone is set to Spanish, otherwise English. */
const DARK_QUERY = "(prefers-color-scheme: dark)";

/** Crews work at night, so dark is the fallback when the browser can't say. */
function useSystemDark() {
  const [dark, setDark] = useState(() => (typeof window === "undefined" || !window.matchMedia ? true : window.matchMedia(DARK_QUERY).matches));
  useEffect(() => {
    if (!window.matchMedia) return;
    const query = window.matchMedia(DARK_QUERY);
    const change = (e: MediaQueryListEvent) => setDark(e.matches);
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  return dark;
}

export function StewardPreferencesProvider({ children }: { children: ReactNode }) {
  const [chosen, setChosen] = useState<Locale | null>(() => stored(LOCALE_KEY, LOCALES));
  const [locale, setLocaleState] = useState<Locale>(() => chosen ?? deviceLocale());
  const [themePreference, setThemeState] = useState<ThemePreference>(() => stored(THEME_KEY, THEMES) ?? "system");
  const systemDark = useSystemDark();
  const theme = resolveTheme(themePreference, systemDark);

  const setLocale = useCallback((next: Locale) => {
    store(LOCALE_KEY, next);
    setChosen(next);
    setLocaleState(next);
  }, []);
  const setThemePreference = useCallback((next: ThemePreference) => {
    store(THEME_KEY, next);
    setThemeState(next);
  }, []);
  const t = useCallback((key: StringKey, vars?: Record<string, string | number>) => translate(locale, key, vars), [locale]);

  const value = useMemo(
    () => ({ locale, localeChosen: chosen !== null, setLocale, themePreference, setThemePreference, theme, t }),
    [locale, chosen, setLocale, themePreference, setThemePreference, theme, t],
  );
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}
