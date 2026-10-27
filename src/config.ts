// Public, per-environment settings. Nothing secret belongs here: this ships to every browser.
// `vite` = development, `vite build --mode staging`, `vite build` = production.

type AdminConfig = {
  /** Clerk publishable key (pk_test_... or pk_live_...). */
  clerkPublishableKey: string;
  /** The public website, for "Back to website" links. Blank means same origin. */
  siteUrl: string;
};

const CLERK_DEV_KEY = "pk_test_bHVja3ktcGlyYW5oYS02NTE3LmNsZXJrLmFjY291bnRzLmRldiQ";

const CONFIGS: Record<string, AdminConfig> = {
  development: { clerkPublishableKey: CLERK_DEV_KEY, siteUrl: "http://test.cbenvironments.com:5173" },
  // Staging shares the Clerk development instance, so test accounts work there too.
  staging: { clerkPublishableKey: CLERK_DEV_KEY, siteUrl: "" },
  // Create the Clerk production instance for cbenvironments.com and paste its pk_live_ key here.
  production: { clerkPublishableKey: "REPLACE_WITH_CLERK_PRODUCTION_PUBLISHABLE_KEY", siteUrl: "" },
};

const base = CONFIGS[import.meta.env.MODE] ?? CONFIGS.development;

export const config: AdminConfig = {
  ...base,
  // Optional override from .env.local or the shell. A blank value falls back to the mode's key,
  // since Vite loads .env.local for production builds too.
  clerkPublishableKey: import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || base.clerkPublishableKey,
};
