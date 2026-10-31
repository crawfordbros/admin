# Portal serving and prefetch policy

The admin app serves `/admin*` and `/portal*`. Vite handles development and preview;
`worker/index.ts` serves staging and production. Builds put the app in `dist/portal/`,
with asset URLs under `/portal/`. The Worker serves those assets and returns the app's
HTML for application routes so React Router can handle direct links.
Preview strips the `/portal/` prefix before static serving because its root is
already `dist/portal/`; browser URLs and client-side routes keep the prefix.

Worker HTML uses `Cache-Control: no-store` and the existing security headers. Static
assets retain their own cache policy. Development retains Vite's `no-cache` behavior.

## Recovering missing development dependencies

A passkey loading error with a `/node_modules/.vite/deps/` URL can mean the running
Vite server is referencing an outdated or missing dependency bundle. Check the
request directly against localhost: Vite reports `504 Outdated Optimize Dep`, which
Cloudflare may display as a gateway timeout. If the dependency files are missing,
reloading the browser alone cannot repair the server.

1. Stop the admin Vite process listening on port 5174 (Ctrl+C in its terminal).
2. From the admin repository, run `pnpm dev:tunnel --force` to rebuild the dependency
   cache. Leave the public frontend and Cloudflare Tunnel running.
3. Reload the portal. In Network, confirm the newly requested WebAuthn module URL
   returns JavaScript with status 200 through `https://testadmin.cbenvironments.com`.
4. Complete passkey verification to confirm sign-in succeeds.

Always stop Vite before manually removing `node_modules/.vite`; removing files from
a running server's cache can leave its in-memory module references pointing at
missing files. Prefer the `--force` restart described in
[Vite's cache recovery guidance](https://vite.dev/guide/dep-pre-bundling#caching).

The login/enrollment screen offers **Reload page** and **Sign out** when its passkey
module cannot load. Reload preserves the current URL and session, but only succeeds
once the module is available again. Cancelling a device prompt still offers **Try
passkey again**. Access remains blocked until server verification succeeds.

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
