import { defineConfig, type Connect, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { SPECULATION_RULES_BODY, SPECULATION_RULES_HEADER, SPECULATION_RULES_HEADERS, SPECULATION_RULES_PATH } from "./shared/speculationRules.ts";

// Local/test frontends share staging data. Production /api routes belong to the production Worker.
const API_DEV_URL = "https://staging-api.cbenvironments.com";

function portalSpeculationRules(): Plugin {
  const htmlHeaders: Connect.NextHandleFunction = (req, res, next) => {
    const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
    if (pathname === "/" || pathname === "/portal/" || pathname.endsWith(".html")) {
      res.setHeader("Speculation-Rules", SPECULATION_RULES_HEADER);
    }
    next();
  };
  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
    if (pathname === SPECULATION_RULES_PATH) {
      if (req.method !== "GET" && req.method !== "HEAD") {
        res.writeHead(405, { Allow: "GET, HEAD" });
        res.end();
        return;
      }
      res.writeHead(200, SPECULATION_RULES_HEADERS);
      res.end(req.method === "HEAD" ? undefined : SPECULATION_RULES_BODY);
      return;
    }
    if (pathname === "/api" || pathname.startsWith("/api/")) return next();

    // Cover directly served HTML before Vite can return a conditional 304.
    htmlHeaders(req, res, next);
  };
  return {
    name: "cbes-portal-speculation-rules",
    configureServer(server) {
      server.middlewares.use(middleware);
      // Vite has rewritten app routes to index.html by this point. Set the
      // header before HTML serving, including 304s, without touching assets.
      return () => server.middlewares.use(htmlHeaders);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
      // Preview serves dist/portal as its root, but built assets use /portal/.
      server.middlewares.use((req, _res, next) => {
        if (req.url?.startsWith("/portal/")) req.url = req.url.slice("/portal".length);
        next();
      });
      return () => server.middlewares.use(htmlHeaders);
    },
  };
}

/**
 * The test host exposes this dev server publicly. Keep crawlers out, as the deployed Worker does
 * with X-Robots-Tag (worker/index.ts).
 */
function noindexDevServer(): Plugin {
  return {
    name: "cbes-noindex-dev-server",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        res.setHeader("X-Robots-Tag", "noindex, nofollow");
        if (req.url === "/robots.txt") {
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("User-agent: *\nDisallow: /\n");
          return;
        }
        next();
      });
    },
  };
}

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
export default defineConfig(({ command, mode }) => ({
  base: command === "build" ? "/portal/" : "/",
  plugins: [react(), tailwindcss(), requireClerkKey(), noindexDevServer(), portalSpeculationRules()],
  build: { outDir: "dist/portal", emptyOutDir: true },
  server: {
    host: true,
    port: 5174,
    strictPort: true,
    allowedHosts: ["testadmin.cbenvironments.com", "test.cbenvironments.com", "localhost"],
    ws: mode === "tunnel" ? { protocol: "wss", host: "testadmin.cbenvironments.com", clientPort: 443 } : undefined,
    // Set the upstream Host for Cloudflare routing; preserve the browser's Origin for MFA.
    proxy: { "/api": { target: API_DEV_URL, changeOrigin: true } },
  },
  preview: {
    port: 4175,
    allowedHosts: ["testadmin.cbenvironments.com", "test.cbenvironments.com", "localhost"],
    proxy: { "/api": { target: API_DEV_URL, changeOrigin: true } },
  },
}));
