import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const API_DEV_URL = process.env.CBES_API_DEV_URL ?? "http://localhost:8787";

/**
 * Staging and production builds require the Clerk key from .env.local or Render's environment.
 * Production must use the live instance: .env.local is loaded for every mode, so a pk_test_ key
 * there would otherwise slip into a production build.
 */
function requireClerkKey(): Plugin {
  return {
    name: "cbes-require-clerk-key",
    apply: "build",
    configResolved(config) {
      if (config.mode === "development") return;
      const key: string = config.env.VITE_CLERK_PUBLISHABLE_KEY ?? "";
      const prefix = config.mode === "production" ? "pk_live_" : "pk_";
      if (!key.startsWith(prefix)) {
        throw new Error(
          `Build stopped: set VITE_CLERK_PUBLISHABLE_KEY to a ${prefix}... key in Render's Environment settings, or .env.local for local builds (see .env.example).`,
        );
      }
    },
  };
}

// Local development: http://test.cbenvironments.com:5174 (the public site runs on :5173).
// In production this app shares cbenvironments.com with the public site, so its files live
// under /portal/ (see worker/index.ts for how /portal* and /admin* are served).
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/portal/" : "/",
  plugins: [react(), tailwindcss(), requireClerkKey()],
  build: { outDir: "dist/portal", emptyOutDir: true },
  server: {
    host: true,
    port: 5174,
    strictPort: true,
    allowedHosts: ["test.cbenvironments.com", "localhost"],
    proxy: { "/api": { target: API_DEV_URL } },
  },
  preview: {
    port: 4175,
    allowedHosts: ["test.cbenvironments.com", "localhost"],
  },
}));
