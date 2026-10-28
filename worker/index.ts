// Serves the portal and admin app on /portal* and /admin*. Built files live under /portal/,
// and every app route gets the app's index.html so React Router can take over.

import { SPECULATION_RULES_BODY, SPECULATION_RULES_HEADER, SPECULATION_RULES_HEADERS, SPECULATION_RULES_PATH } from "../shared/speculationRules";

type Env = { ASSETS: Fetcher };

const SECURITY_HEADERS: Record<string, string> = {
  "X-Robots-Tag": "noindex, nofollow",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

function withHeaders(res: Response, extra: Record<string, string> = {}) {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries({ ...SECURITY_HEADERS, ...extra })) out.headers.set(k, v);
  return out;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === SPECULATION_RULES_PATH) {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return withHeaders(new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } }));
      }
      return withHeaders(new Response(request.method === "HEAD" ? null : SPECULATION_RULES_BODY, { headers: SPECULATION_RULES_HEADERS }));
    }
    if (url.pathname.startsWith("/portal/assets/") || /^\/portal\/[^/]+\.(png|webp|ico|svg|webmanifest)$/.test(url.pathname)) {
      return withHeaders(await env.ASSETS.fetch(request));
    }
    const index = await env.ASSETS.fetch(new Request(new URL("/portal/", url), request));
    return withHeaders(index, { "Cache-Control": "no-store", "Speculation-Rules": SPECULATION_RULES_HEADER });
  },
} satisfies ExportedHandler<Env>;
