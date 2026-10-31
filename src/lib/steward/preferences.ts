import { createContext, useContext } from "react";
import type { Locale, StringKey } from "./strings";

// Language and appearance for the Steward app. Both are kept on the device; S1 adds the language to the
// profile (users.locale) so texts go out in it too.

export const THEMES = ["system", "light", "dark"] as const;
export type ThemePreference = (typeof THEMES)[number];
export type Theme = "light" | "dark";

export function deviceLocale(languages: readonly string[] = typeof navigator === "undefined" ? [] : navigator.languages): Locale {
  return languages[0]?.toLowerCase().startsWith("es") ? "es" : "en";
}

export function resolveTheme(preference: ThemePreference, systemDark: boolean): Theme {
  return preference === "system" ? (systemDark ? "dark" : "light") : preference;
}

export type Preferences = {
  locale: Locale;
  /** True once someone picked a language on this device (rather than it following the phone). */
  localeChosen: boolean;
  setLocale: (locale: Locale) => void;
  themePreference: ThemePreference;
  setThemePreference: (preference: ThemePreference) => void;
  theme: Theme;
  t: (key: StringKey, vars?: Record<string, string | number>) => string;
};

export type Translate = Preferences["t"];

export const PreferencesContext = createContext<Preferences | null>(null);

export function useStewardPreferences(): Preferences {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error("useStewardPreferences needs StewardPreferencesProvider");
  return value;
}

export const useT = () => useStewardPreferences().t;
