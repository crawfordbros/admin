# cbes-admin

The staff portal (`/portal`) and admin dashboard (`/admin`) for CB Environment Solutions. Vite + React 18 + TypeScript + React Router + Tailwind, with sign-in by [Clerk](https://clerk.com). Deployed on Cloudflare Workers on the same hostnames as the public site.

| Environment | URL | Worker | Clerk instance |
| --- | --- | --- | --- |
| Local | http://test.cbenvironments.com:5174/portal | `vite` dev server | Development |
| Staging | https://staging.cbenvironments.com/portal | `cbes-admin-staging` | Development |
| Production | https://cbenvironments.com/portal | `cbes-admin` | Production (to create) |

Sibling repos: `cbes-web` (public site, everything except `/api`, `/portal`, `/admin`) and `cbes-api` (`/api/*`).

## Phase 1 scope

Sign-in and the app shell, ready for Phase 2:

- `/portal/login`: Clerk sign-in (email + password, email code, or magic link). **Sign-ups are restricted**: staff and property managers get accounts by invitation only.
- `/portal`: signed-in landing with role-based tiles (valet, lead, manager, director, admin).
- `/admin` and `/admin/*`: admin-only overview and section placeholders matching BUILD_BRIEF section 5.
- Signed-out visitors are sent to sign in; signed-in users without a role see "Your account isn't set up yet".

Roles come from the Clerk user's **public metadata** for now, for example `{ "role": "admin" }` (Clerk dashboard > Users > user > Metadata). Valid roles: `admin`, `lead`, `valet`, `director`, `manager`. These checks only decide what the screens show. In Phase 2 roles and property access move into D1, and `cbes-api` verifies the Clerk session and enforces access on every request.

## Local development

1. Point `test.cbenvironments.com` at 127.0.0.1 (see the `cbes-web` README).
2. `pnpm install && pnpm dev`, then open http://test.cbenvironments.com:5174/portal.
3. In the Clerk dashboard (application "CB Environment Solutions", Development), invite yourself under Users, then set your public metadata to `{ "role": "admin" }`.

## Configuration

[`src/config.ts`](src/config.ts) holds the Clerk publishable key per build mode (publishable keys are public). Development and staging use the Clerk development instance. **Before the first production deploy:** create the Clerk production instance for `cbenvironments.com` (Clerk dashboard > Configure > Domains; add the DNS records it lists), apply the same settings (restricted sign-up, email link), and paste its `pk_live_...` key into `src/config.ts`. Until then a production build shows a configuration message instead of the portal.

The Clerk secret key belongs only in `cbes-api` (`CLERK_SECRET_KEY`).

## How it is served

The build goes to `dist/portal/` with asset URLs under `/portal/`. [`worker/index.ts`](worker/index.ts) serves those files and returns the app's `index.html` for every other `/portal*` and `/admin*` path, with `noindex`, `X-Frame-Options: DENY` and `Cache-Control: no-store` on the HTML.

## Checks and deploy

```bash
pnpm typecheck && pnpm lint
pnpm test        # role and access rules
pnpm test:e2e    # signed-out redirects, sign-in page, axe; desktop and Pixel 7 (needs network for Clerk)

pnpm wrangler login
pnpm deploy:staging
pnpm deploy:production
```
