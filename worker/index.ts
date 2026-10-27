// Serves the portal and admin app on /portal* and /admin*. Built files live under /portal/,
// and every app route gets the app's index.html so React Router can take over.

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
    if (url.pathname.startsWith("/portal/assets/") || /^\/portal\/[^/]+\.(png|webp|ico|svg|webmanifest)$/.test(url.pathname)) {
      return withHeaders(await env.ASSETS.fetch(request));
    }
    const index = await env.ASSETS.fetch(new Request(new URL("/portal/", url), request));
    return withHeaders(index, { "Cache-Control": "no-store" });
  },
} satisfies ExportedHandler<Env>;
