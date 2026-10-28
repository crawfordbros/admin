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

## Sign-in methods and impersonation

Portal sign-in uses a password or linked Google account, followed by the account's saved MFA
method. Email codes remain available for password recovery and Clerk's additional new-device
verification, but the portal does not offer email-code passwordless sign-in. Each new property
manager should receive a separate account invitation through the existing organization workflow.

Clerk's provider settings must match this UI: in each deployed instance, disable **Email
verification code** and **Email verification link** as sign-in options under **User &
authentication → Email**. Keep email-address verification and password recovery enabled.
Removing a custom UI does not disable provider-side authentication strategies. See
[Clerk's sign-in options](https://clerk.com/docs/guides/configure/auth-strategies/sign-up-sign-in-options).
The locally configured development instance still advertised both email sign-in strategies when
this change was checked; no Clerk dashboard settings were changed by this implementation.

Only Super Admins can use the read-only `?as=manager` preview. Direct frontend URLs and API
requests from other roles are denied. Signed Clerk impersonation sessions must identify an
active portal Super Admin in `act.sub`; the API rechecks that actor's live Clerk role on every
request, including MFA endpoints. Disallowed actors receive `403 impersonation_forbidden` and
the verification screen offers sign-out. The target account's permissions and MFA requirements
still apply. This change does not add an impersonation-creation feature or remove existing
credentials.

## Local development

Both `admin` and `api` pin Node **22.21.1** in `.nvmrc`. Run `nvm use` in each terminal before
starting them. Node 21 cannot run the installed Wrangler/Vite toolchain.

In `admin` and `web`, run `pnpm dev:tunnel`; run `pnpm tunnel` in `web`.
Test and staging share the deployed staging API, D1 and R2. No local API process is needed.
Check both:

```sh
curl https://staging-api.cbenvironments.com/api/health
curl https://testadmin.cbenvironments.com/api/health
```

Both must return `{"ok":true,"environment":"staging"}`. The staging Worker owns `/api/*`
on `test`, `testadmin` and `staging`; local Vite servers and previews also proxy to staging.
Production `/api/*` belongs only to the production Worker and uses separate D1/R2.
If Cloudflare returns `cf-mitigated: challenge`, the API hostname/path needs a Cloudflare
configuration rule that disables browser challenges for API requests; a server proxy cannot
complete an interactive challenge. Do not point test traffic at production to work around it.

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
