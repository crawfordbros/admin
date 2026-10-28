# Portal serving and prefetch policy

The admin app serves `/admin*` and `/portal*`. Vite handles development and preview;
`worker/index.ts` serves staging and production. Builds put the app in `dist/portal/`,
with asset URLs under `/portal/`. The Worker serves those assets and returns the app's
HTML for application routes so React Router can handle direct links.
Preview strips the `/portal/` prefix before static serving because its root is
already `dist/portal/`; browser URLs and client-side routes keep the prefix.

Worker HTML uses `Cache-Control: no-store` and the existing security headers. Static
assets retain their own cache policy. Development retains Vite's `no-cache` behavior.

## Cloudflare prefetch refusals

Cloudflare Speed Brain can inject speculative document requests that return `503`
with `Cf-Speculation-Refused: prefetch refused: not eligible`. Portal HTML is uncached,
and deployed portal routes invoke a Worker; both make these requests ineligible.
Reports data requests use `/api/admin/reports` and are separate from document prefetches.

All serving modes send this header on app HTML:

```http
Speculation-Rules: "/portal/speculation-rules.json"
```

The endpoint supports GET and HEAD and returns an empty ruleset (`{}`) with
`Content-Type: application/speculationrules+json` and `Cache-Control: no-store`.
It is handled before SPA fallback so the browser receives JSON instead of HTML.
The path, header value, response body, and resource headers are shared in
`shared/speculationRules.ts`.

[Cloudflare honors an origin-provided rules header](https://developers.cloudflare.com/speed/optimization/content/speed-brain/),
so the empty ruleset prevents automatic prefetch attempts without changing portal
caching, authentication, API behavior, or the zone-wide Speed Brain setting.

## Verification

After restarting Vite or deploying the Worker, reload the portal in an allowed browser
session. Existing documents need a reload to pick up the new header.

1. Inspect the document response in Network: `Speculation-Rules` must point to
   `/portal/speculation-rules.json`, rather than Cloudflare's `/cdn-cgi/speculation`.
2. Check that the rules resource returns `200`, `{}`, and the MIME type above. A HEAD
   request must return the same headers without a body.
3. Interact with Reports and other navigation links. Confirm normal navigation, report
   lists, filters, summaries, and detail views work without speculative document requests
   or prefetch `503` entries. Verify both direct links and client-side navigation.
4. Confirm JavaScript, images, and API JSON responses retain their existing headers,
   and deployed app HTML still uses `Cache-Control: no-store`.

Run typecheck, lint, the staging build, and the reports/navigation tests before release.
Check development, preview, and a local Worker, then repeat the browser checks through
the tunnel and after staging/production rollout. Command-line access may be denied by
the zone's security policy; use an allowed browser session for the edge checks.

Manual requests with `Sec-Purpose: prefetch` may still be refused by Cloudflare. The
fix stops the browser from initiating these unsupported requests; it does not make
portal documents eligible for Speed Brain.
