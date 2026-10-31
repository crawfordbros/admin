import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { useStewardPreferences } from "../../lib/steward/preferences";
import { StewardPreferencesProvider } from "./StewardPreferencesProvider";

// Wraps every /steward route: language and theme, plus what a phone needs to install the app to the
// home screen (STEWARD_APP_SPEC section 8). Leaving the app puts the portal's look back.

const THEME_COLOR = { dark: "#12143f", light: "#edeef8" } as const;

export function StewardRoot() {
  return (
    <StewardPreferencesProvider>
      <StewardDocument />
      <div className="steward min-h-dvh bg-st-bg text-st-text">
        <Outlet />
      </div>
    </StewardPreferencesProvider>
  );
}

function StewardDocument() {
  const { theme, locale } = useStewardPreferences();

  useEffect(() => {
    const html = document.documentElement;
    html.dataset.stTheme = theme;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const before = meta?.content;
    if (meta) meta.content = THEME_COLOR[theme];
    return () => {
      delete html.dataset.stTheme;
      if (meta && before) meta.content = before;
    };
  }, [theme]);

  useEffect(() => {
    const html = document.documentElement;
    const before = html.lang;
    html.lang = locale;
    return () => {
      html.lang = before;
    };
  }, [locale]);

  useEffect(() => {
    const base = import.meta.env.BASE_URL;
    const added = [
      head("link", { rel: "manifest", href: `${base}steward.webmanifest` }),
      head("link", { rel: "apple-touch-icon", href: `${base}steward-180.png` }),
      head("meta", { name: "apple-mobile-web-app-capable", content: "yes" }),
      head("meta", { name: "mobile-web-app-capable", content: "yes" }),
      head("meta", { name: "apple-mobile-web-app-title", content: "Steward" }),
      head("meta", { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" }),
    ];
    // Built app only: the service worker keeps the app shell for weak signal (public/steward-sw.js).
    if (import.meta.env.PROD && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/steward/sw.js", { scope: "/steward/" }).catch((err: unknown) => console.warn("[steward] service worker not registered", err));
    }
    return () => added.forEach((el) => el.remove());
  }, []);

  return null;
}

function head(tag: "link" | "meta", attrs: Record<string, string>) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.dataset.steward = "";
  document.head.appendChild(el);
  return el;
}
