# CB Environment Solutions · Admin

The operations frontend for **CB Environment Solutions**, a valet trash and property services company serving metro Atlanta. This repository brings together the admin dashboard, property management portal, and **Steward**, the mobile crew app.

[Companion website repository](https://github.com/crawfordbros/web) · [MIT license](LICENSE)

## What it does

| App | Who it serves | Main workflows |
| --- | --- | --- |
| **Admin** · `/admin` | Admins and super admins | Operations overview, organizations and properties, resident issues, violation review, quotes, weekly reporting, user access, and service settings. |
| **Property portal** · `/portal` | Organization representatives and property managers | Property dashboards, issue conversations, violations and courtesy notices, weekly reports, and team management within assigned access. |
| **Steward** · `/steward` | Stewards and valets | Shift check-ins, crew coordination, property details, issue updates, photo-backed violations, and training guides. |

Shared capabilities include invitation-based onboarding, Clerk sign-in, passkey or authenticator verification, account settings, and role-aware navigation. Reports and operational documents can be exported as PDFs; property QR posters connect residents to the public website's reporting form.

Steward includes English and Spanish interfaces, light and dark themes, home-screen installation, cached app content, and an outbox for supported submissions during connection loss.

## Repository scope

This is the frontend source. The API, database, file storage, email delivery, and service integrations are maintained privately and are not included. The [web repository](https://github.com/crawfordbros/web) contains the public website.

Running the complete application requires an authorized account, a Clerk application configured to match the API, and access to the backend. There is no bundled demo backend. The API enforces permissions and verification independently of the frontend's navigation and route guards.

## Stack

- **UI:** React 18, TypeScript, React Router 6, and Tailwind CSS 4.
- **Data and identity:** TanStack Query, Clerk, and SimpleWebAuthn.
- **Documents:** jsPDF, AutoTable, and QR code generation.
- **Build and hosting:** Vite 8 and Cloudflare Workers with static assets.
- **Quality checks:** ESLint, Vitest, Testing Library, Playwright, and axe accessibility checks.

## Local development

Use **Node.js 22.12 or newer** and **pnpm 10.28.2**.

```bash
git clone https://github.com/crawfordbros/admin.git
cd admin
pnpm install --frozen-lockfile
cp .env.example .env.local
```

Set `VITE_CLERK_PUBLISHABLE_KEY` in `.env.local` to the development application's publishable key, then start Vite:

```bash
pnpm dev
```

Open `http://localhost:5174/portal/login` for the property portal and admin sign-in, or `http://localhost:5174/steward/login` for the crew app. Without a Clerk key, the app displays a configuration message.

Cross-app development links use `test.cbenvironments.com`. To use those links locally, add `127.0.0.1 test.cbenvironments.com` to your hosts file and run the companion website on port 5173.

### Environment variables

See [`.env.example`](.env.example) for the configuration template.

| Variable | Purpose |
| --- | --- |
| `VITE_CLERK_PUBLISHABLE_KEY` | Required for sign-in and staging/production builds. Use a development `pk_test_…` key locally; production builds require `pk_live_…`. |
| `VITE_GOOGLE_MAPS_API_KEY` | Optional browser key for address suggestions and map previews. Address entry works as plain text when omitted. Restrict the key by HTTP referrer and API. |

`VITE_*` values are included in the browser bundle. Keep secret keys on the backend and local configuration in the ignored `.env.local` file. Deployment keys are supplied through the build environment.

### Backend and HTTPS

Development and preview servers proxy `/api/*` to the shared staging API configured in [`vite.config.ts`](vite.config.ts). Connected changes affect staging data and may send staging email. A fresh public checkout does not provide its own API or isolated dataset.

Passkeys require HTTPS or localhost and are tied to the hostname where they were enrolled. Maintainers with the existing Cloudflare Tunnel configuration can use `pnpm dev:tunnel` in both frontends and `pnpm tunnel` in the web repo. The tunnel credentials and remote configuration are provisioned separately.

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Start the development server on port 5174. |
| `pnpm dev:tunnel` | Start Vite with the configured HTTPS tunnel hostname. |
| `pnpm typecheck` | Check the TypeScript projects. |
| `pnpm lint` | Run ESLint. |
| `pnpm test` | Run unit and component tests. |
| `pnpm test:e2e` | Run Playwright checks on desktop and mobile. |
| `pnpm build:staging` | Build with staging configuration and a configured Clerk key. |
| `pnpm build` | Build for production; requires a live Clerk publishable key. |
| `pnpm preview` | Serve the built app on port 4175. |

Unit and component tests use test fixtures and mocked authentication. Browser tests cover signed-out routing, sign-in, UI behavior, and accessibility; the authentication checks need a configured Clerk key and network access. Install the browser before the first run:

```bash
pnpm exec playwright install chromium
pnpm test:e2e
```

## Project layout

```text
src/
  App.tsx           Routes and application providers
  access.ts         Roles and frontend access rules
  components/       Shared UI and the admin, property, and crew shells
  pages/            Screens grouped by workflow
  lib/              API client, reports, authentication, and offline helpers
  test/             Fixtures and test setup
public/             Static assets and the Steward service worker
shared/             Shared serving-policy constants
worker/             Cloudflare Worker for app routing and response headers
tests/e2e/          Playwright browser tests
```

## Build and deployment

Build output lives in `dist/portal/`, with assets served beneath `/portal/`. The [Worker](worker/index.ts) serves the application for `/admin*`, `/portal*`, and `/steward*`, including direct navigation to nested routes. Portal HTML uses no-index, no-store, and frame-protection headers.

[`wrangler.jsonc`](wrangler.jsonc) defines the project's staging and production routes. For maintainers with the corresponding Cloudflare access and build configuration:

```bash
pnpm exec wrangler login
pnpm deploy:staging
# Or, for a production release:
pnpm deploy:production
```

Each deployment command builds before uploading. The public website and private API are deployed separately; publishing this frontend does not provision backend services or accounts.

## License

[MIT](LICENSE) · Copyright © 2026 crawfordbros.
