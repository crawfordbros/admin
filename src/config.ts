// Public, per-environment settings. Nothing secret belongs here: this ships to every browser.
// `vite` = development, `vite build --mode staging`, `vite build` = production.
// Keys come from .env.local locally or Render environment variables (see .env.example).

type AdminConfig = {
  /** Clerk publishable key (pk_test_... or pk_live_...). */
  clerkPublishableKey: string;
  /** The public website, for "Back to website" links. Blank means same origin. */
  siteUrl: string;
  /** Google Maps browser key (referrer-restricted). Blank turns address suggestions off. */
  googleMapsApiKey: string;
};

const SITE_URLS: Record<string, string> = {
  development: "http://test.cbenvironments.com:5173",
  tunnel: "https://test.cbenvironments.com",
  staging: "",
  production: "",
};

export const config: AdminConfig = {
  siteUrl: SITE_URLS[import.meta.env.MODE] ?? SITE_URLS.development,
  // Staging and production builds refuse to start without it (vite.config.ts).
  clerkPublishableKey: import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ?? "",
  googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? "",
};
