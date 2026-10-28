# Portal sessions

Admin and organization portal pages share a 30-minute inactivity deadline per Clerk session.
All portal roles use the same policy. A warning appears at 28 minutes; **Stay signed in**
renews the deadline and **Sign out** ends the current browser session. Public website pages,
background queries, Clerk token renewal, focus, and visibility changes never renew activity.

Only trusted keyboard, pointer, wheel, and touch interaction in visible protected pages counts.
Once warned, the current tab requires confirmation; activity in another tab also clears the warning.
Tabs share timestamps and a persistent logout marker through local storage, with BroadcastChannel
also synchronizing tabs when storage is restricted. Final activity updates use keepalive on page exit. No tokens or private
page data are stored there. The API independently enforces the deadline if storage is unavailable,
timers are suspended, or the browser is closed. Expired session IDs cannot be recreated.

`PortalSessionBoundary` handles terminal authentication failures above the route tree.
`RequireSecurity` mounts `PortalSessionActivity` only after MFA succeeds. On expiry the boundary
unmounts protected content, aborts requests, clears queries, and signs out only that Clerk session.
If sign-out is offline, it remains locked across reloads and retries on reconnect.

All authenticated fetches use `authenticatedRequest`. An expired token causes one forced token
refresh shared by concurrent requests, then one replay of the auth-rejected request. Network
errors, HTML gateway errors, permission errors, and security challenges never cause sign-out
or automatic write retries. `mfa_required` sends the user through verification again.

## Local development

Both `admin` and `api` pin Node **22.21.1** in `.nvmrc`. Run `nvm use` in each terminal before
starting them. Node 21 cannot run the installed Wrangler/Vite toolchain.

In `api`, run `pnpm db:migrate:local` and `pnpm dev:tunnel`. In `admin`, run `pnpm dev:tunnel`.
Keep the existing web/tunnel processes running. Check both:

```sh
curl http://127.0.0.1:8787/api/health
curl https://testadmin.cbenvironments.com/api/health
```

Both must return `{"ok":true,"environment":"local"}`. An `ECONNREFUSED` for port 8787 is an
API process problem, not token expiry. A successful portal build does not start the API.

## Release order and verification

1. Apply API migration `0015_portal_sessions.sql` before releasing either application.
2. Release the matching API and frontend together, then reload existing portal tabs. Older
   frontends do not report interaction, so the API will expire their sessions after 30 minutes.
3. Verify admin and representative sign-in, MFA, warning at 28 minutes, renewal, and logout at
   30 minutes. Check multiple tabs, returning after sleep, offline expiry, and public-site activity.
4. Confirm `/api/auth/session` and authenticated reads do not advance `lastActivityAt`; only
   `/api/auth/session/activity` does. Confirm expired sessions return `session_idle_timeout`.
5. Test token expiry and API interruption separately. Refresh should be invisible; an outage
   should offer retry without ending an otherwise active session.

Run the admin test suite, typecheck, lint, and staging build; run the API suite, typecheck, lint,
and Worker deployment dry run. For remote rollout, use the existing staging/production commands
in each repository, applying that environment's migration first. Keep ended session records;
deleting them could authorize a still-active Clerk session again.
