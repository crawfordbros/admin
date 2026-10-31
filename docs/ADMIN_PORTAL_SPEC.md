# CBES Admin Portal — Implementation Spec

Version 1.0 · October 28, 2026 · Owner: Nick Crawford (Super Admin)
Repo: `cbes-admin` (this repo) · API: `cbes-api` (sibling repo, serves `/api/*`)
Design reference: `docs/design/admin/` (one file per screen, exported from the Claude Design canvas "CBES Website Design", page "Admin Portal")

This spec turns the Admin Portal designs into buildable work for this codebase. It builds on what already exists (Clerk invite-only sign-in with required two-step verification, organizations, properties, invitations, the property weekly report with Connecteam clock-ins) and replaces the placeholder `/admin/*` sections.

> Read order for an implementer (human or Claude Code): sections 1–4 first, then the screen you are building in section 7, its API in section 6 and its tables in section 5. Section 9 is the build order.

---

## Contents

1. Scope and principles
2. Roles and permissions
3. Routes and navigation
4. Shared UI (layout, tokens, components)
5. Data model changes (cbes-api, D1)
6. API contract
7. Screen specs (15 screens)
8. Integrations (Google Places, email, storage, Connecteam, PDF)
9. Build order and milestones
10. Testing and acceptance
11. Open questions

---

## 1. Scope and principles

### 1.1 In scope

| # | Screen | Route | Design file | Phase |
| --- | --- | --- | --- | --- |
| 1 | Overview | `/admin` | `Dashboard.dc.html` | 2 |
| 2 | Reports | `/admin/reports` | `Admin-Reports.dc.html` | 2 |
| 3 | Weekly Reports | `/admin/weekly-reports` | `Admin-WeeklyReports.dc.html` | 2 |
| 4 | Violations (list) | `/admin/violations` | `Admin-Violations.dc.html` | 2 |
| 5 | Violation detail | `/admin/violations/:id` | `Admin-ViolationDetail.dc.html` | 2 |
| 6 | Overwatch (stub) | `/admin/overwatch` | `Admin-Overwatch.dc.html` | 2 stub, full in Phase 2b |
| 7 | Organizations | `/admin/organizations` | `Admin-Organizations.dc.html` | 2 |
| 8 | Organization detail | `/admin/organizations/:orgId` | `Admin-OrgDetail.dc.html` | 2 |
| 9 | Add property (modal) | `/admin/organizations/:orgId/properties/new` | `Admin-AddProperty.dc.html` | 2 |
| 10 | Property detail | `/admin/organizations/:orgId/properties/:propertyId` | `Admin-PropertyDetail.dc.html` | 2 |
| 11 | Users | `/admin/users` | `Admin-Users.dc.html` | 2 |
| 12 | Add admin (modal) | `/admin/users/add-admin` | `Admin-AddAdmin.dc.html` | 2 |
| 13 | Quotes (pipeline) | `/admin/quotes` | `Admin-Quotes.dc.html` | 2 |
| 14 | Quote conversation | `/admin/quotes/:quoteId` | `Admin-QuoteDetail.dc.html` | 2 |
| 15 | Settings | `/admin/settings` | `Admin-Settings.dc.html` | 2 |
| — | Sidebar, Top bar | shell | `AdminSidebar.dc.html`, `AdminTopbar.dc.html` | 2 |

### 1.2 Out of scope (this spec)

- The valet phone app beyond what violation detail needs (it is specified in `BUILD_BRIEF.md` section 9).
- Overwatch cases (Phase 2b). Only the stub and the threshold setting ship now.
- Payments, invoicing, e-signature vendors (contracts are uploaded and emailed; signed copies are uploaded back).

### 1.3 Principles

- **The API decides access.** Every list and detail endpoint filters by the caller's role and memberships. The client uses roles only to show or hide controls (same rule as today, see `src/access.ts`).
- **Residents never see violations.** No endpoint returns violations to a resident, and nothing sends a resident a violation notice. Courtesy notices are the property's job.
- **Residents have no accounts.** Resident name and contact live only on the resident report.
- **No invented data in production UI.** Empty states, not placeholders. Sample data in the designs is illustrative only.
- **Keep the existing look and building blocks.** Extend `src/index.css` tokens and `src/components/ui.tsx`; do not add a component library. Charts are small hand-built SVG components (section 4.6).
- **Every list is URL-addressable.** Filters, tabs, sort and page live in the query string so links can be shared and the back button works.
- **New environment variables** follow `claude.md`: add the key to both `.env.example` and `.env.local` with instructions, never real values.

---

## 2. Roles and permissions

### 2.1 Role model

Current roles (`src/access.ts`): `admin`, `representative`, `lead`, `valet`, `director`, `manager`.

Changes:

| Change | Detail |
| --- | --- |
| Add `super_admin` | Exactly one person: Nick. Has everything `admin` has, plus adding admins and upgrading users to admin. Set once in the Clerk dashboard (`{ "role": "super_admin" }`) and enforced by the API. |
| Display `lead` as **Steward** | Keep the stored value `lead` (no data migration). Change `ROLE_LABELS.lead` to `"Steward"`. A Steward is a valet's direct manager. **Steward is its own role, kept alongside Admin** (`users.is_steward`, migration 0015): upgrading a Steward to admin keeps them in the Steward picker, and removing either role removes only that role's access (owner decision, Oct 28, 2026). |
| Keep `representative` | The leader of an Organization ("Representative" everywhere in the UI). |
| Keep `director`, `manager` | Property level: **Management Director** (receives the weekly report) and **Property manager**. |

Update `src/access.ts`:

```ts
export const ROLES = ["super_admin", "admin", "representative", "lead", "valet", "director", "manager"] as const;

const AREA_ROLES: Record<Area, readonly Role[]> = {
  portal: ROLES,
  admin: ["super_admin", "admin"],
  valet: ["super_admin", "admin", "lead", "valet"],
  manager: ["super_admin", "admin", "representative", "director", "manager"],
  organization: ["super_admin", "admin", "representative"],
};

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  representative: "Representative",
  lead: "Steward",
  valet: "Valet",
  director: "Management Director",
  manager: "Property manager",
};

export const isAdmin = (r: Role | null) => r === "admin" || r === "super_admin";
export const isSuperAdmin = (r: Role | null) => r === "super_admin";
```

Add unit tests to `src/access.test.ts` for every new role/area pair.

### 2.2 Permission matrix

✓ = allowed · own = only within their organization/property · — = not allowed

| Action | Super Admin | Admin | Representative | Mgmt Director / Property manager | Steward | Valet |
| --- | --- | --- | --- | --- | --- | --- |
| Open `/admin` | ✓ | ✓ | — | — | — | — |
| Create organization | ✓ | ✓ | — | — | — | — |
| Edit organization (name, logo, status) | ✓ | ✓ | own (name, logo only) | — | — | — |
| Add property to an organization | ✓ | ✓ | own, max 100 per org | — | — | — |
| Edit property basics | ✓ | ✓ | own | own (read only today; edit later) | — | — |
| Set Connecteam job ID, assign Steward | ✓ | ✓ | — | — | — | — |
| Invite Representatives | ✓ | ✓ | — | — | — | — |
| Invite Directors | ✓ | ✓ | — | — | — | — |
| Invite Property managers | ✓ | ✓ | own org | — | — | — |
| Invite Stewards / Valets | ✓ | ✓ | — | — | — | — |
| Add admin / upgrade user to admin | ✓ | — | — | — | — | — |
| Remove a user's access | ✓ | ✓ (not admins) | own org people | — | — | — |
| View resident reports | ✓ | ✓ | own org | own property | assigned properties | — |
| Change report status / assign | ✓ | ✓ | — | — | assigned properties | — |
| View violations | ✓ | ✓ | own org (sent only) | own property (sent only) | assigned properties | own submissions |
| Change violation status | ✓ | ✓ | — | own property: Resolved only | assigned: In review, Sent | — |
| Add violation note | ✓ | ✓ | own (property-visible notes only) | own (property-visible notes only) | assigned | own |
| Weekly reports: send/download | ✓ | ✓ | own org | own property (email to self, existing) | — | — |
| Quotes | ✓ | ✓ | — | — | — | — |
| Settings | ✓ | ✓ | — | — | — | — |

"Sent only": property-side users see a violation only after CBES moves it to **Sent to property** (or later). New and In review stay internal.

### 2.3 Step-up verification

Two actions require a fresh passkey or authenticator check (reuse the existing passkey flow in `src/pages/auth/security.ts` and the API's MFA tables):

- Add admin / upgrade to admin.
- Remove an admin.

The API accepts the action only with a step-up token issued in the last 5 minutes.

---

## 3. Routes and navigation

### 3.1 Route table (`src/App.tsx`)

All admin routes sit inside `<RequireArea area="admin">` and the new `AdminShell` (section 4.2).

| Route | Component | Notes |
| --- | --- | --- |
| `/admin` | `AdminOverviewPage` | Replaces `AdminHome` |
| `/admin/reports` | `AdminReportsPage` | Query: `org`, `property`, `from`, `to`, `type`, `status`, `source`, `assignee`, `tab`, `page`, `sort` |
| `/admin/reports/:reportId` | `ReportDrawer` over the list | Deep-linkable drawer |
| `/admin/violations` | `AdminViolationsPage` | Query: `stage`, `org`, `property`, `type`, `steward`, `from`, `to`, `q`, `view=list|grid`, `page` |
| `/admin/violations/:violationId` | `ViolationDetailPage` | |
| `/admin/overwatch` | `OverwatchStubPage` | |
| `/admin/organizations` | `OrganizationsPage` (rebuilt) | Query: `q`, `status`, `sort`, `view=tiles|list` |
| `/admin/organizations/:orgId` | `OrganizationDetailPage` | Query: `tab=properties|people|invitations|reports|violations|activity` |
| `/admin/organizations/:orgId/properties/new` | `AddPropertyModal` over org detail | |
| `/admin/organizations/:orgId/properties/:propertyId` | `PropertyDetailPage` | Query: `tab=overview|violations|reports|overwatch|team|weekly|settings`, `as=manager` |
| `/admin/users` | `AdminUsersPage` | Query: `group=all|cbes|orgs|invited`, `role`, `q`, `page` |
| `/admin/users/add-admin` | `AddAdminModal` over users (super_admin only) | |
| `/admin/weekly-reports` | `AdminWeeklyReportsPage` | Query: `week=YYYY-MM-DD` (Sunday), `delivery`, `q`, `group=org|none` |
| `/admin/quotes` | `AdminQuotesPage` | Query: `view=pipeline|list`, `q` |
| `/admin/quotes/:quoteId` | `QuoteDetailPage` | |
| `/admin/settings` | `AdminSettingsPage` | Hash anchors: `#overwatch`, `#issues`, `#violations`, `#calendar`, `#reports` |

### 3.2 Redirects (remove Properties)

- Remove `Properties` from `ADMIN_SECTIONS` and the sidebar.
- `/admin/properties` → `/admin/organizations`.
- `/admin/properties/new` → `/admin/organizations` with a toast "Choose an organization, then add the property."
- `/admin/properties/:id` → look up `organizationId` and redirect to `/admin/organizations/:orgId/properties/:id`. A property with no organization redirects to `/admin/organizations?unassigned=1`, which shows a banner listing unassigned properties so an admin can move each into an organization (one-time cleanup; the API should block creating new unassigned properties).
- Keep `PropertyForm.tsx` for the property Settings tab; delete `PropertiesPage.tsx` once redirects ship.

### 3.3 Sidebar groups (`ADMIN_SECTIONS`)

```ts
export const ADMIN_NAV = [
  { group: "Operations", items: [
    { path: "/admin", label: "Overview", icon: "grid" },
    { path: "/admin/reports", label: "Reports", icon: "bar-chart", badge: "openReports" },
    { path: "/admin/violations", label: "Violations", icon: "alert-triangle", badge: "newViolations" },
    { path: "/admin/overwatch", label: "Overwatch", icon: "eye", tag: "Phase 2" },
    { path: "/admin/weekly-reports", label: "Weekly Reports", icon: "calendar" },
  ]},
  { group: "Accounts", items: [
    { path: "/admin/organizations", label: "Organizations", icon: "building" },
    { path: "/admin/users", label: "Users", icon: "users" },
    { path: "/admin/quotes", label: "Quotes", icon: "mail", badge: "newQuotes" },
    { path: "/admin/settings", label: "Settings", icon: "settings" },
  ]},
] as const;
```

Badge counts come from `GET /api/admin/nav-counts` (section 6), refreshed every 60 s and on window focus.

---

## 4. Shared UI

### 4.1 Tokens (`src/index.css` `@theme`)

Keep all existing tokens. Add:

```css
--color-navy-ink: #1a1c5e;      /* sidebar, headings (same value as navy-dark) */
--color-canvas: #f4f5fa;        /* admin page background */
--color-subtle: #fafafd;        /* table headers */
--color-tint-2: #eeeff8;        /* selected states */
--color-gold-tint: #f4f1ec;
--color-warning: #7a4b00;   --color-warning-bg: #fff4db;
--color-danger-bg: #fdecea;
--color-success-bg: #e3f2e8;
--color-info: #1c4fa0;      --color-info-bg: #e6f0ff;
--color-neutral: #3a3c50;   --color-neutral-bg: #f0f0f4;
--color-alert-dot: #e04f3a;
```

Contrast rules (already in `BUILD_BRIEF.md` section 4): `gold` only for large text and marks; `gold-text` for small gold labels on white; `gold-light` for gold text on navy.

### 4.2 Layout: `AdminShell`

Replaces the admin branch of `Shell.tsx` (portal pages keep the current header).

- **Desktop (≥1024 px):** fixed-width left sidebar (248 px, `bg-navy-ink`), main column with a sticky top bar (64 px, white, bottom border) and content (`px-8 py-7`, background `canvas`). Content is fluid; tables scroll horizontally inside their card.
- **Below 1024 px:** sidebar collapses into a slide-over drawer opened by a menu button in the top bar; the top bar keeps search as an icon button.
- **Print:** sidebar and top bar hidden (`print:hidden`).

**Sidebar** (`AdminSidebar.dc.html`):
- Logo (`logo-gold-on-navy.webp`, 44 px tall) + "Admin Portal" / "CBES operations", linking to `/admin`.
- Group labels ("OPERATIONS", "ACCOUNTS"): 11 px, bold, letter-spacing 0.12em, color `#9FA2D6`.
- Items: 42 px tall, 10 px radius, icon 20 px + label 14.5 px semibold. Active: white background, `navy-ink` text, `aria-current="page"`. Inactive: `on-navy` text, hover `bg-white/10`.
- Badges: red pill for counts (`alert-dot`), muted pill "Phase 2" for Overwatch, gold pill for Quotes count.
- Footer: "View website" link (`config.siteUrl`), "Aiming for Excellence".

**Top bar** (`AdminTopbar.dc.html`):
- Breadcrumb: "Admin Portal / {section} / {item}" (each segment a link except the last).
- Global search (⌘K / Ctrl+K opens a command palette; section 7.0).
- Notifications bell with unread dot (section 7.0).
- User block: avatar initials, name, role label (`ROLE_LABELS`); clicking opens Clerk `UserButton` menu.
- Remove the "Sample data" chip (design only).

### 4.3 Icons

Use one inline-SVG icon set (stroke 1.8–2, 24 px viewBox). Recommended: `lucide-react` (tree-shaken, ~1 kB per icon) or copy the paths used in the design files into `src/components/icons.tsx`. Never use emoji. Icon-only buttons need `aria-label`.

### 4.4 Components to add to `src/components/`

| Component | Props (TypeScript) | Notes |
| --- | --- | --- |
| `PageHeader` | `{ title; description?; actions?: ReactNode; back?: { to; label } }` | 30 px Fira Sans title, 15 px muted description |
| `KpiTile` | `{ label; value; delta?: { text; tone: "good"\|"bad"\|"neutral" }; icon?; spark?: number[]; to? }` | Optional link; sparkline 84×30 |
| `StatTile` | `{ label; value; sub?; tone? }` | Smaller tile for detail pages |
| `FilterBar` | `{ filters: FilterDef[]; value; onChange; savedViews? }` | Each filter is a button that opens a `Popover` with checkboxes, radio list, or date range. Active filters get a navy 1.5 px border and `tint-2` background; chips row below with remove buttons and "Clear all" |
| `SegmentedControl` | `{ options: { value; label; icon? }[]; value; onChange; label }` | `role="group"`, buttons with `aria-pressed` |
| `Tabs` | `{ tabs: { value; label; count? }[]; value; onChange; variant: "pill"\|"underline" }` | `role="tablist"`; arrow-key navigation |
| `DataTable<T>` | `{ columns: Column<T>[]; rows: T[]; rowKey; selectable?; onRowClick?; sort?; empty; loading; footer? }` | Sticky header, horizontal scroll wrapper, checkbox column, keyboard row focus |
| `Pagination` | `{ page; pageSize; total; onChange }` | "Showing 1–8 of 112" + Previous/Next |
| `StatusBadge` | `{ status; kind: "report"\|"violation"\|"delivery"\|"quote"\|"user" }` | Color map in 4.5 |
| `Avatar`, `AvatarStack` | `{ name; color?; size? }`, `{ people; max }` | Initials; deterministic color from id |
| `Modal` | `{ title; onClose; size: "md"\|"lg"; footer }` | Focus trap, Escape closes, returns focus; route-driven modals close by navigating back |
| `Drawer` | same as Modal, slides from right | Reports detail |
| `Popover`, `Menu` | Headless; `aria-haspopup`, arrow keys | Row action menus |
| `Switch` | `{ checked; onChange; label }` | `role="switch"` |
| `Stepper` | `{ steps: { label; sub?; state: "done"\|"current"\|"todo" }[] }` | Violation progress, quote stage |
| `EmptyState` | `{ icon; title; body; action? }` | |
| `Toast` | via `useToast()` | Success and error notices after mutations |
| `PhotoGallery` | `{ photos: { url; caption; takenAt; gps? }[] }` | Main image + thumbnails + zoom/download |
| `FileDrop` | `{ accept; maxBytes; onFiles }` | Drag-and-drop + button |

### 4.5 Status colors

| Kind | Value → (background / text) |
| --- | --- |
| Report | New `neutral-bg/neutral` · Assigned `info-bg/info` · In progress `tint-2/navy` · Resolved `success-bg/success` · Closed `neutral-bg/muted` |
| Violation | New `neutral-bg/neutral` · In review `warning-bg/warning` · Sent to property `info-bg/info` · Resolved `success-bg/success` · Dismissed `neutral-bg/muted` |
| Reply clock | < 12 h used: `success` · 12–20 h: `warning` · > 20 h or overdue: `danger` · replied: `neutral` "Replied in 2h" |
| Weekly delivery | Sent `success` · Scheduled `navy` · Bounced/Failed `danger` · Not sent `neutral` |
| Quote stage | New `danger` dot · In conversation `#D99A1E` · Quote sent `navy` · Contract sent `gold-text` · Won `success` · Lost `muted` |
| Org/property status | Active `success` · Onboarding/Starting `warning` · Inactive `neutral` |

### 4.6 Charts (`src/components/charts/`)

Hand-built, responsive SVG (`viewBox` + `width: 100%`), each with `role="img"` and an `aria-label` that states the main number, plus a visually hidden data table for screen readers.

| Chart | Used on | Spec |
| --- | --- | --- |
| `Sparkline` | KPI tiles, property table | 7–12 points, stroke 2, no axes |
| `GroupedBars` | Overview "Activity, last 8 weeks" | 2 series per week (violations `navy`, resident reports `gold-light`), y-grid every 10 |
| `StackedBars` | Reports "by week" | 12 weeks; Resolved `success`, In progress `navy`, New `gold-light` |
| `Donut` | Reports "24-hour reply promise" | Percent on time, center label |
| `HBarList` | Issue types, violations by type, by building | Label column, bar, value; optional 2-segment stacked bar |
| `DotStrip` | Weekly reports nights (5 squares), unit history (squares) | |

Use `Intl.NumberFormat` and `formatDay` from `src/lib/format.ts` for labels. All times shown in America/New_York (existing helper `todayInNewYork`).

### 4.7 Accessibility and quality bar

- WCAG 2.2 AA. Every control reachable by keyboard; visible focus (existing gold outline).
- Touch targets ≥ 44 px on mobile; table row actions ≥ 34 px on desktop.
- Every page sets `document.title` as `"{Page} | CBES Admin"` (existing pattern).
- Loading: skeletons for tiles and tables (not spinners) after 300 ms.
- Errors: `Alert` with the API message and a Retry button.
- Optimistic updates only for status changes and switches; roll back with a toast on failure.

---

## 5. Data model changes (cbes-api, D1 / SQLite)

The API already stores organizations, properties, memberships, invitations, resident reports and portal MFA (through migration `0005_portal_mfa.sql`). Add migrations `0006`–`0012` below. IDs are text UUIDs, times are ISO 8601 UTC text, money is integer cents. Every table gets `created_at` and, where edited, `updated_at`.

### 5.1 `0006_org_property_profile.sql`

```sql
ALTER TABLE organizations ADD COLUMN logo_key TEXT;            -- R2 object key
ALTER TABLE organizations ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('onboarding','active','inactive'));
ALTER TABLE organizations ADD COLUMN service_area TEXT;        -- "Decatur, Brookhaven, Clarkston"
ALTER TABLE organizations ADD COLUMN property_limit INTEGER NOT NULL DEFAULT 100;
ALTER TABLE organizations ADD COLUMN customer_since TEXT;      -- date

ALTER TABLE properties ADD COLUMN photo_key TEXT;              -- R2 object key (square, 512px)
ALTER TABLE properties ADD COLUMN zip TEXT;
ALTER TABLE properties ADD COLUMN lat REAL;
ALTER TABLE properties ADD COLUMN lng REAL;
ALTER TABLE properties ADD COLUMN google_place_id TEXT;
ALTER TABLE properties ADD COLUMN building_count INTEGER;
ALTER TABLE properties ADD COLUMN property_type TEXT CHECK (property_type IN ('garden','mid_rise','high_rise'));
ALTER TABLE properties ADD COLUMN steward_user_id TEXT;        -- CBES Steward (role lead)
-- Existing: name, slug, address, city, county, unit_count, organization_id, service_start_date,
-- contract_type, status, connecteam_job_id.
-- After the one-time cleanup, enforce organization_id NOT NULL in the API (SQLite cannot add NOT NULL in place).
```

`properties.status` gains `'starting'` (service start date in the future) — computed in queries, not stored.

### 5.2 `0007_staff_assignments.sql`

```sql
CREATE TABLE property_staff (
  property_id TEXT NOT NULL REFERENCES properties(id),
  user_id     TEXT NOT NULL,                 -- Clerk user id
  role        TEXT NOT NULL CHECK (role IN ('lead','valet')),
  connecteam_user_id TEXT,                   -- to match clock-ins
  created_at  TEXT NOT NULL,
  PRIMARY KEY (property_id, user_id)
);
CREATE TABLE staff_reporting (                -- valet -> Steward
  valet_user_id   TEXT PRIMARY KEY,
  steward_user_id TEXT NOT NULL
);
```

### 5.3 `0008_violations.sql`

```sql
CREATE TABLE violation_types (
  key TEXT PRIMARY KEY,                       -- 'bag_not_tied'
  label TEXT NOT NULL, label_es TEXT,
  counts_for_overwatch INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL
);
-- seed: bag_not_tied, outside_container, over_filled, after_8pm, prohibited_item, bulk_item_at_door,
--       container_not_out (counts_for_overwatch = 0, "log only")

CREATE TABLE violations (
  id TEXT PRIMARY KEY,
  ref_no INTEGER NOT NULL UNIQUE,             -- V-2041
  property_id TEXT NOT NULL REFERENCES properties(id),
  building TEXT, unit TEXT NOT NULL,
  type_key TEXT NOT NULL REFERENCES violation_types(key),
  note TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_review','sent','resolved','dismissed')),
  logged_by TEXT NOT NULL,                    -- valet user id
  steward_user_id TEXT,                       -- snapshot of the valet's Steward at logging time
  logged_at TEXT NOT NULL,                    -- device time
  synced_at TEXT NOT NULL,
  lat REAL, lng REAL, gps_accuracy_m REAL,
  client_id TEXT UNIQUE,                      -- offline dedupe from the valet app
  sent_at TEXT, resolved_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX violations_property_unit ON violations(property_id, unit, logged_at);
CREATE INDEX violations_status ON violations(status, logged_at);

CREATE TABLE violation_photos (
  id TEXT PRIMARY KEY, violation_id TEXT NOT NULL REFERENCES violations(id),
  r2_key TEXT NOT NULL, width INTEGER, height INTEGER, taken_at TEXT, sort_order INTEGER NOT NULL
);

CREATE TABLE violation_events (                -- notes + status changes + system events
  id TEXT PRIMARY KEY, violation_id TEXT NOT NULL REFERENCES violations(id),
  actor_user_id TEXT,                         -- null = system
  kind TEXT NOT NULL CHECK (kind IN ('logged','status','note','reassigned','sent','system')),
  from_status TEXT, to_status TEXT,
  body TEXT,
  visibility TEXT NOT NULL DEFAULT 'cbes' CHECK (visibility IN ('cbes','property')),
  created_at TEXT NOT NULL
);
CREATE TABLE violation_event_mentions (        -- who a note pinged
  event_id TEXT NOT NULL REFERENCES violation_events(id), user_id TEXT NOT NULL,
  PRIMARY KEY (event_id, user_id)
);
```

### 5.4 `0009_notifications.sql`

```sql
CREATE TABLE notifications (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL,
  kind TEXT NOT NULL,                         -- 'violation_note','report_due','quote_new','invite_stale',...
  title TEXT NOT NULL, body TEXT, link TEXT NOT NULL,   -- link is an app path
  read_at TEXT, emailed_at TEXT, created_at TEXT NOT NULL
);
CREATE INDEX notifications_user ON notifications(user_id, read_at, created_at);
```

### 5.5 `0010_quotes.sql`

```sql
CREATE TABLE quotes (
  id TEXT PRIMARY KEY, ref_no INTEGER NOT NULL UNIQUE,
  stage TEXT NOT NULL DEFAULT 'new' CHECK (stage IN ('new','conversation','quote_sent','contract_sent','won','lost')),
  lost_reason TEXT,
  contact_name TEXT NOT NULL, contact_title TEXT, contact_email TEXT NOT NULL, contact_phone TEXT,
  company TEXT, community_name TEXT, address TEXT, unit_count INTEGER, property_type TEXT,
  desired_start TEXT, current_provider TEXT, services TEXT NOT NULL,   -- JSON array of service keys
  request_message TEXT, source TEXT NOT NULL DEFAULT 'web' CHECK (source IN ('web','contact','manual')),
  owner_user_id TEXT,
  rate_cents_per_unit INTEGER, term TEXT CHECK (term IN ('12_month','36_month','month_to_month')),
  organization_id TEXT,                       -- set when won and linked
  first_response_at TEXT, won_at TEXT,
  email_thread_token TEXT NOT NULL UNIQUE,    -- used in reply-to address (section 8.2)
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE quote_messages (
  id TEXT PRIMARY KEY, quote_id TEXT NOT NULL REFERENCES quotes(id),
  direction TEXT NOT NULL CHECK (direction IN ('in','out')),
  from_email TEXT NOT NULL, to_email TEXT NOT NULL, subject TEXT,
  body_text TEXT NOT NULL, body_html TEXT,
  sent_by_user_id TEXT,                       -- for 'out'
  provider_message_id TEXT, created_at TEXT NOT NULL
);
CREATE TABLE quote_documents (
  id TEXT PRIMARY KEY, quote_id TEXT NOT NULL REFERENCES quotes(id),
  kind TEXT NOT NULL CHECK (kind IN ('quote_pdf','contract','signed_contract','coi','other')),
  file_name TEXT NOT NULL, r2_key TEXT NOT NULL, content_type TEXT NOT NULL, bytes INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','ready','sent','signed')),
  uploaded_by TEXT NOT NULL, sent_message_id TEXT, created_at TEXT NOT NULL
);
CREATE TABLE quote_notes (
  id TEXT PRIMARY KEY, quote_id TEXT NOT NULL REFERENCES quotes(id),
  author_user_id TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL
);
```

The public site's quote form (cbes-web → `POST /api/quotes`) inserts into `quotes` with `stage = 'new'` and a first `quote_messages` row (`direction = 'in'`).

### 5.6 `0011_settings.sql`

```sql
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_by TEXT, updated_at TEXT NOT NULL);
-- keys: overwatch.threshold  {"count":3,"days":30,"countDismissed":false}
--       calendar.service_nights ["sun","mon","tue","wed","thu"]
--       calendar.start_time "20:00"
--       calendar.makeup_policy "next_night" | "skip"
--       weekly_report.schedule {"day":"mon","time":"07:00","tz":"America/New_York"}
--       email.reports_from "office@cbenvironments.com"
--       email.quotes_from "quotes@cbenvironments.com"

CREATE TABLE issue_types (
  key TEXT PRIMARY KEY, label TEXT NOT NULL, label_es TEXT,
  reply_target_hours INTEGER NOT NULL DEFAULT 24, on_form INTEGER NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL
);
CREATE TABLE holidays (
  date TEXT PRIMARY KEY, name TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL
);
```

Seed `issue_types` from the existing resident report issue types (keep their keys so existing reports still resolve). Seed holidays: 2026-11-26 Thanksgiving Day, 2026-12-25 Christmas Day, 2027-01-01 New Year's Day, 2027-05-31 Memorial Day, 2027-07-04 Independence Day, 2027-09-06 Labor Day.

### 5.7 `0012_reporting_and_audit.sql`

```sql
CREATE TABLE weekly_report_runs (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('property','organization','all')),
  property_id TEXT, organization_id TEXT,
  week_start TEXT NOT NULL,                   -- Sunday
  trigger TEXT NOT NULL CHECK (trigger IN ('schedule','manual')),
  recipients TEXT NOT NULL,                   -- JSON array of emails
  status TEXT NOT NULL CHECK (status IN ('scheduled','sent','bounced','failed')),
  error TEXT, sent_by TEXT, sent_at TEXT, created_at TEXT NOT NULL
);
CREATE INDEX weekly_runs_week ON weekly_report_runs(week_start, scope);

CREATE TABLE saved_views (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, page TEXT NOT NULL,   -- 'reports' | 'violations'
  name TEXT NOT NULL, query TEXT NOT NULL, created_at TEXT NOT NULL
);

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY, actor_user_id TEXT NOT NULL, action TEXT NOT NULL,  -- 'user.upgrade_admin', 'settings.update', ...
  target_type TEXT, target_id TEXT, detail TEXT,                          -- JSON
  created_at TEXT NOT NULL
);
```

Write an `audit_log` row for: org create/edit, property create/edit/move, invitations, access removal, role changes, admin upgrades, settings changes, violation status changes, weekly report manual sends, quote stage changes, contract sends.

### 5.8 Derived values (computed in SQL, not stored)

- **Overwatch units:** units where `COUNT(violations)` with `counts_for_overwatch = 1` and status not `dismissed` (unless `countDismissed`) in the last `days` ≥ `count`.
- **Report reply clock:** `reply_target_hours − (now − created_at)` until `first_response_at` is set.
- **Nights serviced:** distinct service dates with a Connecteam clock-in at the property's job, over scheduled nights (service nights minus holidays).
- **Per-100-units rate:** `count / unit_count × 100`.

---

## 6. API contract

All routes are under `/api`, JSON, Clerk bearer token (existing `useApi()`), 422 with `fieldErrors` for validation (existing `ApiError`). Lists return `{ items, total, page, pageSize }` unless noted. Admin-only routes live under `/api/admin/*`; routes shared with representatives keep their current paths (`/api/organizations/*`).

Add the response types to `src/lib/api.ts` next to the existing ones.

### 6.1 Shell

| Method | Path | Who | Response |
| --- | --- | --- | --- |
| GET | `/admin/nav-counts` | admin | `{ openReports: number; newViolations: number; newQuotes: number }` |
| GET | `/search?q=` | admin | `{ results: { kind: "org"\|"property"\|"unit"\|"report"\|"violation"\|"user"\|"quote"; id; title; subtitle; link }[] }` (max 20) |
| GET | `/notifications?unread=1` | any | `{ items: Notification[]; unread: number }` |
| POST | `/notifications/read` | any | body `{ ids?: string[] }` (omit = all) |

### 6.2 Overview

`GET /admin/overview?range=today|7d|30d`

```ts
type AdminOverview = {
  range: { from: string; to: string; label: string };
  kpis: {
    openReports: Kpi; avgFirstReplyHours: Kpi; violations: Kpi; overwatchUnits: Kpi; newQuotes: Kpi;
  };
  activity: { weekStart: string; violations: number; residentReports: number }[];   // last 8 weeks
  attention: { kind: "report_due" | "violations_to_review" | "no_clock_in" | "quote_waiting" | "invites_stale";
               title: string; subtitle: string; tag: string; severity: "high" | "medium" | "low"; link: string }[];
  tonight: { propertyId: string; name: string; orgName: string; stewardName: string | null;
             progressPct: number | null; status: "not_service_night" | "no_clock_in" | "in_progress" | "done" }[];
  orgs: { id: string; name: string; properties: number; openReports: number; violations30d: number; avgReplyHours: number | null }[];
};
type Kpi = { value: number | null; previous: number | null; spark: number[]; note?: string };
```

`tonight.progressPct`: share of the property's buildings closed out (from the valet close-out) or, until close-out exists, `null` with status from Connecteam (clocked in = `in_progress`, clocked out = `done`).

### 6.3 Reports

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/admin/reports` | Query = filters in 3.1. Returns `{ items: ReportRow[], total, page, pageSize, tabCounts: Record<ReportStatusTab, number> }` |
| GET | `/admin/reports/summary` | Same filters (no `tab`, `page`). Returns KPIs + chart data (below) |
| GET | `/admin/reports/:id` | Detail with timeline and replies |
| PATCH | `/admin/reports/:id` | `{ status?, assigneeUserId? }` |
| POST | `/admin/reports/bulk` | `{ ids: string[], status?, assigneeUserId? }` |
| POST | `/admin/reports/:id/replies` | `{ body, channel: "email" }` → emails the resident from office@ and sets `first_response_at` |
| POST | `/admin/reports` | Log a phone report: same body as the public form + `source: "phone"` |
| GET | `/admin/reports/export.csv` | Same filters; streams CSV |
| GET/POST/DELETE | `/saved-views?page=reports` | Saved filter sets per user |

```ts
type ReportRow = {
  id: string; refNo: number; issueKey: string; issueLabel: string; createdAt: string;
  orgId: string; orgName: string; propertyId: string; propertyName: string;
  building: string | null; unit: string | null; source: "web" | "qr" | "phone";
  replyClock: { state: "replied"; hours: number } | { state: "open"; hoursLeft: number; targetHours: number };
  assignee: { id: string; name: string } | null; status: ReportStatus;
};
type ReportsSummary = {
  kpis: { total: Kpi; open: Kpi & { nearingDue: number }; avgFirstReplyHours: Kpi; avgResolveDays: Kpi; topIssue: { label: string; count: number; share: number } };
  byWeek: { weekStart: string; resolved: number; inProgress: number; new: number }[];   // 12 weeks
  replyBuckets: { under4h: number; h4to12: number; h12to24: number; over24h: number; onTimePct: number };
  byType: { key: string; label: string; count: number }[];
  byProperty: { propertyId: string; name: string; orgName: string; count: number; per100Units: number; avgReplyHours: number | null; spark: number[] }[];
};
```

### 6.4 Violations

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/admin/violations` | Filters in 3.1. Returns rows + `stageCounts` |
| GET | `/admin/violations/:id` | Detail (below), photos as signed URLs (1 h) |
| PATCH | `/admin/violations/:id` | `{ status?, typeKey?, unit?, building? }` |
| POST | `/admin/violations/:id/notes` | `{ body, visibility: "cbes"\|"property", notifyUserIds: string[], attachments?: string[] }` |
| POST | `/admin/violations/:id/reassign` | `{ valetUserId?, stewardUserId? }` |
| POST | `/admin/violations/send` | `{ ids?: string[] }` (omit = all In review) → status `sent`, emails each property's managers one digest |
| GET | `/admin/violations/export.csv` | |
| POST | `/valet/violations` | Valet app (existing brief): multipart with photos, `client_id` dedupe |

Portal-side (representative, director, manager) read endpoints already follow `/portal/properties/:id/*`; add `GET /portal/properties/:id/violations` returning only `status IN ('sent','resolved')` and only `visibility = 'property'` events.

```ts
type ViolationRow = {
  id: string; refNo: number; typeKey: string; typeLabel: string; loggedAt: string;
  orgName: string; propertyId: string; propertyName: string; building: string | null; unit: string;
  valet: Person; steward: Person | null; photoCount: number; thumbUrl: string | null;
  unitCount30d: number; overwatchThreshold: number; notesCount: number; status: ViolationStatus;
};
type ViolationDetail = ViolationRow & {
  note: string | null; syncedAt: string; gps: { lat: number; lng: number; accuracyM: number } | null;
  photos: { id: string; url: string; takenAt: string | null }[];
  people: { valet: Person; steward: Person | null; propertyManagers: Person[]; representatives: Person[] };
  events: { id: string; kind: string; actor: Person | null; body: string | null; visibility: "cbes" | "property";
            fromStatus?: string; toStatus?: string; mentions: Person[]; createdAt: string }[];
  unitHistory: { id: string; refNo: number; typeLabel: string; loggedAt: string; status: ViolationStatus }[];
  steps: { label: string; sub: string; state: "done" | "current" | "todo" }[];
};
type Person = { id: string; name: string; role: Role; email?: string };
```

### 6.5 Overwatch (stub)

`GET /admin/overwatch/preview` → `{ threshold: { count, days }, units: { propertyId, propertyName, orgName, unit, count, mostCommon, lastAt }[] }`

### 6.6 Organizations and properties

| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| GET | `/organizations` | admin (all), rep (own) | Extend `OrganizationRow` (below) |
| GET | `/admin/organizations/summary` | admin | Stats strip |
| POST | `/organizations` | **admin only** | `{ name, serviceArea?, status? }` (already admin-only in API; keep) |
| GET | `/organizations/:orgId` | admin, rep | Extend `OrganizationDetail` with kpis, property cards, staff |
| PATCH | `/organizations/:orgId` | admin; rep (name, logo) | |
| POST | `/organizations/:orgId/logo` | admin, rep | multipart image → R2, returns `{ logoUrl }` |
| POST | `/organizations/:orgId/properties` | admin, rep | Body in 7.9. **409 `limit_reached`** when `count ≥ property_limit` |
| POST | `/properties/photo-upload` | admin, rep | Returns `{ uploadId, previewUrl }`; committed on property create |
| GET | `/organizations/:orgId/properties/:propertyId` | admin, rep, property staff | Property detail (7.10) |
| PATCH | `/organizations/:orgId/properties/:propertyId` | admin; rep (basics) | `connecteamJobId`, `stewardUserId` admin only |
| GET | `/admin/stewards` | admin | `{ items: { id, name, propertyCount }[] }` for the Steward picker |
| GET | `/properties/slug-available?slug=` | admin, rep | `{ available: boolean, suggestion?: string }` |

```ts
type OrganizationRow = {
  id: string; name: string; initials: string; logoUrl: string | null; status: "onboarding" | "active" | "inactive";
  serviceArea: string | null; properties: number; propertyLimit: number; units: number;
  representatives: { id: string; name: string }[]; pendingInvitations: number;
  openReports: number; violations30d: number; avgReplyHours: number | null;
};
type OrganizationsSummary = { organizations: number; properties: number; units: number; representatives: number; pendingInvitations: number };
```

Invitations keep the existing `POST /organizations/:orgId/invitations` (roles `representative`, `manager`, `director`). Add `POST /admin/staff-invitations` for `lead` and `valet` (admin only), and `POST /organizations/:orgId/invitations/:id/resend`.

### 6.7 Users

| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| GET | `/admin/users` | admin | Query: `group`, `role`, `q`, `page`. Merges Clerk users + memberships + pending invitations |
| GET | `/admin/users/role-counts` | admin | Counts per role |
| PATCH | `/admin/users/:userId` | admin | `{ role?, propertyIds?, organizationIds? }` — cannot set `admin`/`super_admin` |
| POST | `/admin/users/:userId/reset-mfa` | admin | Clears portal second factors; user re-enrolls at next sign-in |
| DELETE | `/admin/users/:userId/access` | admin (not on admins), super_admin (anyone but self) | Removes memberships and sets Clerk role to none |
| POST | `/admin/admins/invite` | **super_admin**, step-up | `{ email, name }` → Clerk invitation with `role: "admin"` |
| POST | `/admin/admins/upgrade` | **super_admin**, step-up | `{ userId }` → sets Clerk public metadata role `admin`, keeps their property assignments, emails the user and other admins |
| POST | `/auth/step-up/options` + `/auth/step-up/verify` | super_admin | Passkey/authenticator challenge → `{ stepUpToken, expiresAt }` (5 min) |

```ts
type AdminUserRow = {
  id: string | null;            // null for pending invitations
  invitationId: string | null; name: string | null; email: string; role: Role;
  access: string;               // "Everything", "Peachtree Residential (6)", "The Oaks, Clarkston Commons"
  mfa: "passkey" | "authenticator" | "none"; lastActiveAt: string | null; status: "active" | "invited" | "removed";
};
```

### 6.8 Weekly reports

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/admin/weekly-reports?week=` | Grouped rows (below) |
| POST | `/admin/weekly-reports/send` | `{ week, scope: "property"\|"organization"\|"all", id? }` → creates runs; returns run ids |
| GET | `/admin/weekly-reports/:propertyId/pdf?week=` | Server-rendered PDF (or keep client jsPDF, see 8.5) |
| GET | `/admin/weekly-reports/organization/:orgId/pdf?week=` | Org roll-up PDF |
| GET | `/admin/weekly-reports/zip?week=` | ZIP of all property PDFs |
| GET | `/admin/weekly-reports/next-run` | `{ at: string, covers: { start, end } }` |

```ts
type WeeklyAdminView = {
  week: { start: string; end: string; label: string };
  summary: { properties: number; sent: number; bounced: number; residentReports: number; violations: number };
  groups: {
    org: { id: string; name: string; initials: string; representative: string | null; rollupSentAt: string | null };
    rows: { propertyId: string; name: string; units: number; city: string | null;
            nights: { scheduled: number; serviced: number; byNight: boolean[] }; avgClockIn: string | null;
            residentReports: number; resolved: number; avgReplyHours: number | null;
            violations: number; overwatchUnits: number;
            director: { name: string; email: string } | null;
            delivery: "sent" | "scheduled" | "bounced" | "failed" | "not_sent"; lastRunId: string | null }[];
  }[];
};
```

The existing property report endpoint (`/portal/properties/:id/report`) stays the source for one property's report content; the admin list aggregates the same numbers.

### 6.9 Quotes

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/quotes` | **Public** (from cbes-web, Turnstile-verified). Creates quote + first inbound message |
| GET | `/admin/quotes` | `{ columns: { stage, count, items: QuoteCard[] }[], kpis }` for pipeline; `?view=list` returns rows |
| GET | `/admin/quotes/:id` | Detail: contact, request, stage, notes, messages, documents, quote fields |
| PATCH | `/admin/quotes/:id` | `{ stage?, lostReason?, ownerUserId?, rateCentsPerUnit?, term?, unitCount? }` |
| POST | `/admin/quotes/:id/notes` | `{ body }` (internal) |
| POST | `/admin/quotes/:id/messages` | `{ body, template?, attachmentIds: string[] }` → sends from quotes@ (8.2), stores `out` message, sets `first_response_at`, moves `new → conversation` |
| POST | `/admin/quotes/:id/documents` | multipart upload → R2, `kind`, returns document |
| POST | `/admin/quotes/:id/quote-pdf` | Generates the quote PDF from fields, stores as `quote_pdf` document |
| POST | `/admin/quotes/:id/send-contract` | `{ documentIds, body }` → emails from quotes@, marks docs `sent`, stage `contract_sent` |
| POST | `/admin/quotes/:id/convert` | When won: create organization (or link `organizationId`) and first property, prefilled from the quote |
| POST | `/email/inbound` | Webhook from the email provider (8.2). Verifies signature, matches `email_thread_token`, stores `in` message, notifies owner |

### 6.10 Settings

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/admin/settings` | `{ overwatch, calendar, weeklyReport, email, issueTypes, violationTypes, holidays }` |
| PATCH | `/admin/settings` | Partial update of the settings keys |
| PUT | `/admin/settings/issue-types` | Full ordered list (keys immutable once used; label edits allowed; delete = `on_form: false`) |
| PUT | `/admin/settings/violation-types` | Same rules |
| POST / DELETE | `/admin/settings/holidays` | `{ date, name }` / `?date=` |
| GET | `/admin/settings/overwatch-preview?count=&days=&countDismissed=` | `{ units: number, properties: number }` for the live preview |

`GET /settings/public` (no auth) returns issue types `on_form = 1`, service nights and holidays for the public Residents page and report form.

---

## 7. Screen specs

Each screen lists: purpose, layout (top to bottom, then left to right), data, interactions, states, permissions and acceptance criteria. Copy and sample values in the design files are illustrative; the copy below is final unless marked [placeholder].

### 7.0 Shell features (all screens)

**Global search (⌘K / Ctrl+K, or click the search field)**
- Opens a centered command palette (`Modal` size md) with a text input and grouped results: Organizations, Properties, Units ("Unit 412 · The Oaks at Decatur"), Reports (#1042), Violations (V-2041), Users, Quotes.
- Debounce 200 ms; `GET /search`. Arrow keys move, Enter opens `link`, Escape closes.
- Recent searches (last 5, `localStorage`, wrapped in try/catch).

**Notifications bell**
- Red dot when `unread > 0`. Click opens a 360 px popover: list of notifications (title, body, relative time, unread dot), "Mark all read", each item links to its target.
- Sources: violation notes that mention you, reports within 3 h of the 24 h promise, new quote requests, quote replies, invitations unaccepted after 7 days, weekly report bounces.
- Poll every 60 s and on focus.

**Breadcrumb**: built from route params with names from the loaded data (no extra calls).

---

### 7.1 Overview — `/admin` (`Dashboard.dc.html`)

**Purpose:** what needs Nick or Nigel tonight, at a glance.

**Layout**
1. Header row: date eyebrow ("TUESDAY, OCTOBER 27", gold-text, 13 px, letter-spaced), title "Good evening, {firstName}" (morning before 12, afternoon before 17, evening after), subtitle summarizing tonight ("Tonight is a service night. 9 of 14 properties have a valet clocked in." / "No service tonight."). Right: `SegmentedControl` Today / 7 days / 30 days (default 7 days; query `range`).
2. KPI row (5 `KpiTile`s, auto-fit min 200 px): Open resident reports → `/admin/reports?tab=open`; Avg first reply → `/admin/reports`; Violations this week → `/admin/violations`; Overwatch units (note "Phase 2 preview") → `/admin/overwatch`; New quote requests → `/admin/quotes`. Each shows value, sparkline (last 7 periods), delta text colored good/bad (for Avg first reply and Open reports, lower is good).
3. Two columns (2:1, wrap under 900 px):
   - **Activity, last 8 weeks:** `GroupedBars` (violations navy, resident reports gold-light), legend top right.
   - **Needs attention:** up to 6 items from `attention[]`, sorted by severity then age. Each row: colored icon tile, title, subtitle, tag pill, whole row is a link.
4. Two columns (1:1):
   - **Tonight's service:** one row per active property: name, "{org} · Steward {name}", progress bar (green at 100 %), status chip (Done / In progress / No clock-in). "Live from Connecteam" chip in the card header. Hidden on non-service nights (show "Next service night: Sunday").
   - **Organizations at a glance:** table (logo initials, name, properties, open reports, violations 30 d, avg reply), link "All organizations".

**States:** skeleton tiles and rows; if Connecteam isn't configured, Tonight's service shows `VALET_STATUS_TEXT.not_configured`.

**Acceptance**
- [ ] All five KPIs match the Reports, Violations, Overwatch preview and Quotes pages for the same range.
- [ ] "Needs attention" includes any report with < 3 h left on its reply target.
- [ ] Range switch updates URL and all widgets.

---

### 7.2 Reports — `/admin/reports` (`Admin-Reports.dc.html`)

**Purpose:** manage every resident report across organizations, with filters and charts.

**Layout**
1. `PageHeader` "Resident reports", description "Every issue residents report, across all organizations and properties. Each one gets a reply within 24 hours." Actions: **Export CSV** (outline), **Log a phone report** (primary; opens the public report form fields in a modal with Source = Phone).
2. **Filter card** (`FilterBar`):
   - Filters: Organization (multi), Property (multi, limited to chosen orgs), Dates (Today, 7 d, 30 d, 90 d, This month, Custom range), Issue type (multi), Status (multi; default Open = new + assigned + in_progress), Source (Web, QR, Phone), Assigned to (people + "Unassigned").
   - Active chips row with remove buttons and **Clear all**.
   - **Save view**: names the current query; saved views listed at the right ("Saved views: …"), each a link; delete via a small menu.
3. **KPI row** (5): Reports (delta vs previous equal period), Open now ("{n} nearing 24 hours" in danger), Avg first reply ("Goal: under 24h"), Avg time to resolve, Top issue ("Missed pickups · 30% of all reports").
4. Charts row (2:1): **Reports by week** (`StackedBars`, 12 weeks, legend) and **24-hour reply promise** (`Donut` + bucket list; "Over 24 hours" row in danger).
5. Charts row (1:1.4): **By issue type** (`HBarList`) and **By property** table (property + org, reports, per-100-units mini bar, avg reply, 4-week sparkline). Clicking a bar or row applies that filter.
6. **Reports table** card:
   - Header: status `Tabs` (pill) Open / New / In progress / Resolved / Closed with counts; when rows are selected, bulk actions **Assign** and **Change status** appear with "{n} selected".
   - Columns: checkbox · Report (issue icon tile, issue label, "#1042 · 21h ago") · Organization · Property · Unit · Source chip · Reply clock chip (4.5) · Assigned (avatar + name or "Unassigned") · Status badge.
   - Sort by: Submitted (default newest), Reply clock (most urgent), Property.
   - Row click opens **Report drawer** (`/admin/reports/:id`): resident name and contact (shown only here), description, photos, status select, assignee select, timeline, "Reply to resident" composer (email from office@; sets first response), internal comment box.
   - Pagination 25 per page.

**Permissions:** admin only on this screen (reps see their reports in the portal).

**Acceptance**
- [ ] Every filter is reflected in the URL and survives reload; charts and KPIs use the same filters except the status tab.
- [ ] Reply clock turns warning at 12 h used and danger at 20 h; replied shows "Replied in {h}h".
- [ ] Bulk assign/status updates all selected rows and writes audit entries.
- [ ] CSV export contains exactly the filtered rows.
- [ ] Logging a phone report creates a report with `source = phone` and does not email the resident unless an email is entered.

---

### 7.3 Weekly Reports — `/admin/weekly-reports` (`Admin-WeeklyReports.dc.html`)

**Purpose:** see every property's weekly numbers, and send or download reports for one property, an organization or everyone.

**Layout**
1. `PageHeader` "Weekly reports", description "Sent every Monday at 7:00 AM Eastern to each property's Management Director. Send again or download any property or organization." Actions: **Download all (ZIP)**, **Send all again** (primary; confirm dialog listing recipient count).
2. **Week card:** previous/next buttons, "REPORT WEEK" eyebrow, "Sun Oct 18 – Sat Oct 24, 2026" (Sunday to Saturday; default = last completed week; next disabled for future weeks). Right: summary stats (Properties, Sent Mon 7:00 AM, Bounced in danger, Resident reports, Violations).
3. Toolbar: search properties; delivery filter segmented (All / Sent / Bounced, with counts); Group by (Organization / None).
4. **One card per organization:**
   - Header (subtle background): org logo, name, meta "{n} properties · Representative {name} · roll-up sent {day time}". Actions: **Org PDF**, **Send org report** (sends each property's report to its Director and the roll-up to the org's Representatives).
   - Table: Property (photo thumb, name, "312 units · Decatur") · Nights (5 `DotStrip` squares + "5/5") · Avg clock-in · Resident reports ("5 (4 resolved)") · Avg reply · Violations (mini bar + number) · Overwatch ("2 units" or "—") · Sent to (Director avatar + name; "No Director" warning chip if missing) · Delivery badge · Actions: Preview (opens `/portal/properties/:id/report?week=` in a new tab), Download PDF, Send again (icon buttons with labels).
5. **Next run card:** "Next run: Monday, November 2 at 7:00 AM Eastern", "Covers Oct 25 – Oct 31. Organization roll-ups go to each Representative; the all-properties roll-up goes to Nick and Nigel." Link "Change schedule" → Settings `#reports`.

**Interactions:** Send actions show a confirm popover with recipients, then a toast "Sent to 3 people". Bounced rows show the bounce reason in a tooltip and a **Fix recipient** link to the property's Team tab.

**Acceptance**
- [ ] Numbers match the existing property weekly report for the same week.
- [ ] Manual sends create `weekly_report_runs` rows with `trigger = manual` and `sent_by`.
- [ ] Org PDF contains a summary page plus one page per property.
- [ ] A property without a Director is flagged and excluded from send-all with a warning count.

---

### 7.4 Violations — `/admin/violations` (`Admin-Violations.dc.html`)

**Purpose:** review what valets logged and move it to the property.

**Layout**
1. `PageHeader` "Violations", description "Logged by valets with a photo, time and GPS. Reviewed by CBES, then shared with the property. Residents are never contacted." Actions: **Export**, **Send reviewed to properties ({n})** (primary; disabled when 0; sends all In review).
2. **Stage tiles** (5, clickable, act as the stage filter; selected tile has 2 px navy border and shadow): New ("Logged since last review"), In review ("Being checked by CBES"), Sent to property ("Waiting on the property"), Resolved ("This month"), Dismissed ("Not a violation"). Each with a colored dot and count.
3. **Table card:**
   - Toolbar: search ("Unit, ticket number or valet"), filter buttons Org, Property, Type, Steward, Dates; `SegmentedControl` List / Photo grid.
   - Columns: checkbox · Violation (56 px photo thumb with photo-count badge, type label as link, "V-2041 · Tonight 8:47 PM") · Property · Unit ("Peachtree · Bldg 4 · 412") · Logged by (avatar, name, "Valet") · Steward (avatar, name) · Unit history (3 squares filled per violation in window, red when at threshold, "3 in 30 days") · Notes (comment icon + count) · Status badge · open chevron.
   - Bulk actions on selection: **Mark in review**, **Send to property**, **Dismiss** (asks for a reason).
   - **Photo grid view:** 4–6 columns of photo cards (photo, type, unit, property, status) for fast review.
   - Pagination 25.

**Acceptance**
- [ ] Stage counts match the filter results.
- [ ] Unit history count uses the Overwatch window and type rules from Settings.
- [ ] "Send reviewed to properties" sends one digest email per property and moves each violation to Sent.
- [ ] Property-side users never see New or In review violations (API test).

---

### 7.5 Violation detail — `/admin/violations/:id` (`Admin-ViolationDetail.dc.html`)

**Purpose:** see the photos and facts, talk to the valet and Steward, and move the ticket forward.

**Layout**
1. Back link "All violations" (keeps the list's query string).
2. Header: warning icon tile, eyebrow "V-2041 · Logged tonight at 8:47 PM", title "{Type} · Unit {unit}", subtitle "{Property} · Building {n} · {Org}". Actions: **Status** select (New, In review, Sent to property, Resolved, Dismissed — Dismissed asks for a reason), **Print**, **Send to property** (primary; hidden once sent).
3. **Progress `Stepper`**: Logged ({valet} · {time}) → In review → Sent to property ({manager names}) → Resolved.
4. Two columns (1.4:1):
   - Left:
     - **Photo gallery**: dark stage 4:3, caption bar with timestamp and GPS accuracy, Zoom and Download buttons, thumbnails, note "Photos show trash and doorways only, never people."
     - **Notes and activity**:
       - Composer: textarea with `@` mention autocomplete (people on this violation: valet, Steward, property managers, admins). **Notify** chips under it, pre-checked: the logging valet and their Steward (from `staff_reporting`); property managers unchecked. Visibility `SegmentedControl`: **CBES team only** (default) / **Also show property**. Attach photo button. Submit "Add note and notify {n}".
       - Feed (newest first): avatar, "**{name}** {action} · {time}", note bodies in a bubble (gray for CBES-only, blue for property-visible, with a small "Visible to property" label).
   - Right:
     - **Details** `dl`: Organization (link), Property (link), Building · Unit, Type (editable via pencil), Valet note, Logged (device time + synced time), Location (lat, lng, accuracy) and a static map image (Google Static Maps, same key as 8.1) with a pin.
     - **People**: Valet ("Valet · logged this", tag On shift/Off from Connecteam), Steward ("Steward · {valet}'s direct manager", tag Notified when pinged), Property manager(s) ("Gets it when sent"), Representative ("Weekly report"). Button **Reassign valet or Steward** (admin only) opens a small modal.
     - **Unit {n} history**: last 30–90 days list (type · date · V-number link) with a threshold pill ("3 in 30 days", danger when ≥ threshold) and the line "At the Overwatch threshold. Overwatch tools arrive in Phase 2."

**Notification rules (API)**
- On note submit: create `violation_events` (kind `note`) + `violation_event_mentions`; create a `notifications` row for each notified user; send an email immediately to each ("{author} added a note on V-2041 · Bag not tied · Unit 412" with the note and a link). Valets also see it in the valet app inbox.
- Status changes write an event; moving to Sent emails the property's managers (or batches into the digest when done in bulk).

**Acceptance**
- [ ] Notifying the valet and Steward creates notifications and emails for exactly the checked people.
- [ ] CBES-only notes never appear in any property-side endpoint.
- [ ] Status changes are reflected in the stepper and the list without reload.
- [ ] Photo URLs expire (signed) and are never public R2 URLs.

---

### 7.6 Overwatch (stub) — `/admin/overwatch` (`Admin-Overwatch.dc.html`)

**Layout**
1. Navy hero card: "COMING IN PHASE 2" gold pill, title "Overwatch", description "Units that keep breaking the trash rules get flagged automatically, so property managers can step in before it becomes a lease problem. Today the flag shows on violations and in weekly reports. The full workspace arrives in Phase 2." Buttons: **Threshold: {count} in {days} days · Edit** (→ Settings `#overwatch`) and a disabled **Create Overwatch case**. Decorative eye illustration (`aria-hidden`).
2. Four feature cards (Automatic flags · Cases for managers · Courtesy notices via the property · Clears on its own).
3. **Units at the threshold today** (read-only table from `/admin/overwatch/preview`): Unit, Property · Organization, Violations in window (squares + number), Most common type, Last.

**Acceptance:** [ ] Preview count equals the Overview KPI. [ ] No write actions exist.

---

### 7.7 Organizations — `/admin/organizations` (`Admin-Organizations.dc.html`)

**Purpose:** every management company, with a dashboard and tile or list view.

**Layout**
1. `PageHeader` "Organizations", description "The management companies CBES works with. Every property belongs to an organization. Representatives run their organization and can add up to 100 properties." Action **New organization** (primary, with "Admins" pill; hidden for non-admins).
2. Stats strip (5): Organizations, Properties, Units under service, Representatives, Pending invitations (icon tiles).
3. Toolbar: search ("Search organizations or Representatives"), Status select (Active / Onboarding / Inactive / All), Sort (Most properties, Name A–Z, Most open items, Newest), view toggle **Tiles / List** (query `view`, remembered per user in `localStorage`).
4. **Tiles** (auto-fill min 330 px): colored banner (org brand color derived from id, solid), logo (uploaded logo or initials) overlapping the banner, status pill, name, service area, **"{n} of 100 properties"** with progress meter and "{units} units", three mini stats (Open reports, Violations 30d, Avg reply), footer with Representative avatars + "Lauren Kim + 1" and "Open →". Whole card is a link.
5. **List**: table with logo+name+area, status, properties meter "{n}/100", units, Representatives avatars, open reports, violations 30d, avg reply, open chevron.

**New organization modal** (admin only): Name (required, unique), Service area, Status (Onboarding default), Logo upload (optional), "Invite a Representative now" (email + name, optional). On save → navigate to the new org.

**Unassigned properties banner** (`?unassigned=1` or whenever any exist): "{n} properties aren't in an organization yet" with a **Move** action per property.

**Acceptance**
- [ ] Only admins see and can call New organization (API returns 403 for others).
- [ ] View toggle and filters persist in the URL.
- [ ] Meter caps at the org's `property_limit`.

---

### 7.8 Organization detail — `/admin/organizations/:orgId` (`Admin-OrgDetail.dc.html`)

**Shared with Representatives** at `/portal/organizations/:orgId` (same component, `area="portal"`, admin-only controls hidden) — extend the existing `OrganizationView`.

**Layout**
1. Back link "All organizations" (admin).
2. **Header card:** banner, 84 px logo (click to change, admin/rep), name, meta (customer since, service area, status). Actions: **Invite people**, edit (pencil: name, service area, status — status admin only), **Add property** (primary; disabled with tooltip at the limit).
3. Underline `Tabs`: Properties ({n}) · People ({n}) · Invitations ({n}) · Reports ({open}) · Violations ({30d}) · Activity.
4. KPI strip (5): Properties "{n} of 100" ("{100−n} slots left"), Units under service, Open resident reports (oldest age), Violations 30 days (per 100 units), Avg first reply.
5. **Properties tab** (2:1 with aside):
   - Search; grid of property cards (16:9 photo or placeholder, status pill overlay, name, "{city} · {units} units · {contract}", chips "{n} open reports" (danger if > 0, success if 0) and "{n} violations 30d", footer Property manager avatar+name and "Steward {name}"). Card links to property detail.
   - Last tile: dashed **Add a property** ("{slots} of 100 slots left").
   - Aside: **Representatives** (+ Invite; description; list with avatar, name, email, tags Primary / 2FA on), **Property staff** (name, role, properties), **Waiting to accept** (email, role, property, age, **Resend**, **Cancel**).
6. **People tab:** table of Representatives and property staff with role, properties, last active, remove access.
7. **Invitations tab:** pending list with resend/cancel (existing endpoints).
8. **Reports / Violations tabs:** the Reports and Violations tables from 7.2/7.4 pre-filtered to this org (reuse components).
9. **Activity tab:** audit log entries for this org.

**Invite people modal:** Email, Name, Role (Representative · Management Director · Property manager), Properties (multi, required for Director/manager). Only admins invite Representatives and Directors; Representatives can only invite Property managers, into their own org (owner decision, Oct 28, 2026).

**Acceptance**
- [ ] A Representative sees the same page for their org without admin controls (status, Connecteam, Steward).
- [ ] Add property is blocked at the limit in UI and API (409).
- [ ] Invitations from this page set the Clerk role automatically (existing behavior).

---

### 7.9 Add property — `/admin/organizations/:orgId/properties/new` (`Admin-AddProperty.dc.html`)

A route-driven `Modal` (size lg, 900 px) over the org page. Same component at `/portal/organizations/:orgId/properties/new` for Representatives.

**Header:** org logo, "{Org} · {n} of 100 properties", title "Add a property", close (X → back).

**Section 1 — Location**
- **Street address** combobox with Google Places Autocomplete (8.1): type ≥ 3 chars, debounce 250 ms, show up to 5 suggestions (main text bold, secondary text muted), "Address suggestions powered by Google" footer (required attribution). Keyboard: arrows, Enter selects, Escape closes. Restrict to US, bias to metro Atlanta.
- On select: fetch place details → fill **City**, **County**, **ZIP** (editable, light gray background), store `lat`, `lng`, `google_place_id`, and show a success line "Filled in from the address. Edit if anything is off." Map preview (Static Maps) with a pin.
- Manual entry is always allowed (Google down or new construction).

**Section 2 — Profile**
- **Photo or logo** (132 px square drop zone): PNG/JPG/WebP ≤ 5 MB, client-side crop to square and resize to 512 px, upload to `/properties/photo-upload`, show preview with Replace/Remove.
- **Property name** (required; defaults to the Google place name if it's an establishment), **Units** (required, 1–5000), **Buildings** (optional), **Property type** radio cards Garden / Mid-rise / High-rise.

**Section 3 — Service**
- **Service start date**, **Contract** segmented (12-month / 36-month / Month-to-month).
- **Resident report web address**: prefix "/report?p=" + slug (auto from name, live availability check, editable) and hint "Printed in the QR code on every container."
- **Connecteam job ID** (admins only; "CBES admins only" pill; hint "Links valet clock-ins to this property's weekly report.").

**Section 4 — People**
- Hint: "Invite the property's team. They set a password and two-step verification from the invitation email. Representatives of {Org} already see this property."
- Repeating rows: Email (required per row), Name (optional), Role select (Property manager / Management Director), remove. **Add another person**. Duplicate emails rejected inline.
- **CBES Steward for this property** (admins only): avatar + "Dana Brooks · 4 properties" + select from `/admin/stewards`.

**Footer:** limit meter "This will be property {n+1} of 100"; **Cancel**; primary "**Add property and send {k} invites**" (or "Add property" when no invites).

**Submit:** `POST /organizations/:orgId/properties` with

```ts
{
  name: string; address: string; city: string; county: string; zip: string;
  lat?: number; lng?: number; googlePlaceId?: string;
  photoUploadId?: string; unitCount: number; buildingCount?: number; propertyType?: "garden" | "mid_rise" | "high_rise";
  serviceStartDate?: string; contractType?: ContractType; slug?: string;
  connecteamJobId?: string;          // ignored unless admin
  stewardUserId?: string;            // ignored unless admin
  invites: { email: string; name?: string; role: "manager" | "director" }[];
}
```

Response `{ property, invitations: { email, status: "invited" | "added" }[] }` → navigate to the property page with a toast "{name} added. {k} invitations sent."

**Validation:** field errors from the API (422) map to fields; partial invite failures show inline per row without losing the created property.

**Acceptance**
- [ ] Selecting a Google suggestion fills city, county and ZIP; manual entry still works.
- [ ] Representatives can add properties to their own org only, up to the limit; Connecteam and Steward fields are not shown to them and ignored by the API.
- [ ] Modal is fully keyboard accessible and traps focus.

---

### 7.10 Property detail — `/admin/organizations/:orgId/properties/:propertyId` (`Admin-PropertyDetail.dc.html`)

Also the **property manager's home** at `/portal/properties/:id` (extend the existing `PropertyPage`); `as=manager` on the admin route renders exactly that view ("See what managers see", existing feature).

**Layout**
1. Breadcrumb: Organizations / {Org} / {Property}.
2. **Header card:** 96 px photo/logo, name, full address + county, chips (status, "{units} units · {buildings} buildings", "{contract} · since {month year}", "Connecteam job {id}" admin only). Actions: **View as** segmented (Admin view / See what managers see — admin only), **QR codes** (opens printable sheet, Phase 4 item from the brief), **Edit** (opens `PropertyForm` in a modal), **Weekly report** (primary → existing weekly report page).
3. Underline tabs: Overview · Violations ({30d}) · Reports ({open}) · Overwatch ("Phase 2" pill) · Team ({n}) · Weekly reports · Settings.
4. **Overview tab**
   - KPI strip (5): Nights serviced (last week, "5 / 5"), Avg valet clock-in ("From Connecteam"), Open resident reports (reply clock), Violations 30 days (per 100 units), Units at threshold ("Overwatch in Phase 2").
   - **Violations by building** (`HBarList` with two segments: bag/container issues navy, timing/bulk gold; legend) + "View all violations".
   - **Latest violations**: photo cards (4) linking to detail; property-side users only see Sent/Resolved.
   - **Resident reports**: last 3 with status.
   - Aside: **CBES team** ("Connecteam" chip): Steward (role, properties count, "Lead" tag) and valets with today's clock-in ("On shift" / "Off · last shift Mon"); **Property staff** (+ Invite): managers and Directors with roles; **Overwatch** dashed card with "Phase 2" pill, threshold units sentence and disabled **Create Overwatch case**.
5. **Violations tab:** violations table filtered to the property (property-side users: Sent/Resolved only, and they can mark Resolved and add property-visible notes).
6. **Reports tab:** reports table filtered to the property (property-side users read-only + comments).
7. **Overwatch tab:** stub (same copy as 7.6) scoped to this property.
8. **Team tab:** CBES team (Steward, valets; admin can assign/unassign) and property staff (invite, remove).
9. **Weekly reports tab:** list of past weeks with delivery status, Preview/Download/Send (admin, rep).
10. **Settings tab:** `PropertyForm` (existing) + photo, status, danger zone "Move to another organization" (admin only).

**Acceptance**
- [ ] Property managers see Overview, Violations (Sent+), Reports, Overwatch stub, Team (read only) and Weekly reports for their property only.
- [ ] "See what managers see" hides every admin-only control and data.
- [ ] Team tab assignments drive who gets pinged on violation notes.

---

### 7.11 Users — `/admin/users` (`Admin-Users.dc.html`)

**Purpose:** manage everyone with an account across the app.

**Layout**
1. `PageHeader` "Users", description "Everyone with a portal account. Accounts are by invitation only and need two-step verification. Residents don't have accounts: their details stay on the tickets they send." Actions: **Invite CBES staff** (Stewards, valets; admin), **Add admin** (navy, shield icon, "Super Admin" pill; rendered only for `super_admin`).
2. **Roles card:** two groups of count chips. CBES TEAM: Super Admin ("Nick only. Adds admins."), Admin, Stewards, Valets. ORGANIZATIONS: Representatives, Management Directors, Property managers. Clicking a chip filters the table.
3. **Table card:**
   - Toolbar: group `Tabs` Everyone / CBES team / Organizations / Invited (counts), search (name or email), Role select.
   - Columns: Person (avatar, name, email) · Role badge · Access ("Everything", "Peachtree Residential (6)", property names) · Two-step (Passkey / Authenticator / Not set up in warning) · Last active · Status (Active / Invited / Removed) · actions menu.
   - **Row menu:** Upgrade to Admin (gold, "Super Admin only"; shown only to super_admin and only for non-admins) · Change role or access · Reset two-step verification · View activity · Remove access (danger, confirm). Invited rows: Resend, Cancel invitation.
   - Admin rows cannot be changed by an admin; only the super_admin can remove an admin (with step-up).

**Acceptance**
- [ ] Non-super-admins never see Add admin or Upgrade to Admin, and the API rejects those calls with 403.
- [ ] Removing access signs the user out on next request (API checks role on every call).
- [ ] Residents never appear.

---

### 7.12 Add admin — `/admin/users/add-admin` (`Admin-AddAdmin.dc.html`)

Route-driven `Modal` (640 px), super_admin only (others redirected to `/admin/users`).

**Layout**
- Navy header with gold shield tile, "Add an admin", "Only the Super Admin can do this", close.
- `Tabs` (pill): **Invite someone new** (Email, Name) / **Upgrade an existing user** (default when opened from a row menu with `?user=`).
- Upgrade tab: user search (excludes admins), selected user card (avatar, name, email, MFA status) with "{current role} → Admin" chips.
- "What an admin can do" checklist: ✓ See and manage every organization and property · ✓ Create organizations · ✓ Review violations and resident reports · ✓ Send weekly reports and respond to quotes · ✓ Invite and remove users · ✕ Add or upgrade admins (Super Admin only).
- Confirmation checkbox: "I understand {name} will see every organization, property, report and quote." (required). If the user is a Steward: "{name} keeps Steward duties in the field."
- Warning strip: "You'll confirm with your passkey. {name} and Nigel get an email, and the change is logged."
- Footer: Cancel · **Confirm with passkey and upgrade** (or "…and send invite").

**Flow:** click primary → step-up passkey/authenticator (`/auth/step-up/*`) → `POST /admin/admins/upgrade` or `/invite` with `stepUpToken` → toast + close → users list refreshed.

**Acceptance**
- [ ] Without a valid step-up token the API returns 403 `step_up_required`.
- [ ] Upgrade keeps the user's existing property assignments.
- [ ] Audit log entry `user.upgrade_admin` with actor and target.

---

### 7.13 Quotes pipeline — `/admin/quotes` (`Admin-Quotes.dc.html`)

**Layout**
1. `PageHeader` "Quotes", description "Requests from the website, replies from quotes@cbenvironments.com, and contracts out for signature." Actions: view toggle **Pipeline / List**, **New quote** (manual entry modal: contact + request fields).
2. KPI strip (5): New requests ("{n} waiting over 24h" danger), Avg first response ("Goal: same day"), Quotes out ("{units} units"), Contracts out ("Sent {date}"), Won this quarter ("{pct}% win rate").
3. **Pipeline board** (horizontal scroll, columns 268 px): New ("Reply within 24 hours") · In conversation ("Questions, site visit") · Quote sent ("Waiting on decision") · Contract sent ("Out for signature") · Won ("Signed this quarter") · Lost (collapsed by default, expand toggle). Column header: colored dot, title, count.
   - Card: community name, company, age pill (danger if New and > 24 h), chips "{units} units" + service chips, footer with last-activity icon/text ("Website form", "4 emails · site visit Thu", "Quote PDF viewed twice", "36-month agreement") and owner avatar (or "—" unassigned). Highlighted border for the most urgent card.
   - Drag and drop between columns updates `stage` (keyboard alternative: card menu "Move to…"). Moving to Lost asks for a reason. Moving to Won offers **Create organization and property** (`/convert`).
4. **List view:** table (Ref, Community, Company, Units, Services, Stage, Owner, Last activity, Age) with sort and search.

**Acceptance**
- [ ] New website requests appear within a minute and notify admins.
- [ ] Drag-and-drop and the keyboard menu both change stage and write audit entries.

---

### 7.14 Quote conversation — `/admin/quotes/:id` (`Admin-QuoteDetail.dc.html`)

**Layout**
1. Back link "Quotes pipeline". Title = community name; subtitle "{company} · {units} units · {city} · requested {date time}". Right: stage `Stepper` as clickable segments (New ✓ · In conversation · Quote sent · Contract sent · Won · Lost).
2. Three columns (1 : 2 : 1.1, stacking on narrow screens):
   - **Left aside:**
     - Contact card: avatar, name, title, email (mailto), phone (tel).
     - Request card: address, type, buildings, desired start, current provider, services chips, the request message as a quote block.
     - Internal notes: list ("**Nigel:** …") + add field (Enter to save). Never emailed.
   - **Center: Email conversation**
     - Header "Email conversation", hint "Replies to quotes@ land here automatically".
     - Thread: inbound messages left (gray), outbound right (tinted), each with sender, time, body (plain text, line breaks kept), attachments as chips (download).
     - Composer: From **quotes@cbenvironments.com** (locked), To (contact; add CC), **Template** select (Send quote, Schedule site visit, Send contract, Follow up — fills subject and body with merge fields `{{contactFirstName}}`, `{{community}}`, `{{senderName}}`), body textarea, attachment chips (from Documents or new upload), **Send** (label follows template: "Send quote").
   - **Right aside:**
     - **Quote** card: Per unit / month (currency input), Units, Term (12-month auto-renew / 36-month / Month-to-month), Monthly total (computed), **Generate quote PDF** (creates a branded PDF in Documents).
     - **Contract** card: hint "Start from a template, upload the filled-in agreement, then send it for signature." Template select (Vendor Agreement – 12-Month Auto-Renew / 36-Month Term / Month-to-Month; downloads the .docx template from `/api/admin/contract-templates/:key`), `FileDrop` "Upload contract" (PDF or Word, ≤ 20 MB), document list with status pills (Draft, Ready, Sent, Signed) and per-document menu (Download, Mark signed, Delete), **Send contract from quotes@** (attaches selected documents + the CBES certificate of insurance; stage → Contract sent). **Upload signed copy** appears once sent; uploading marks the contract Signed and suggests moving to Won.

**Acceptance**
- [ ] Outbound mail comes from quotes@cbenvironments.com with a reply-to that routes back to this quote (8.2).
- [ ] Inbound replies appear in the thread and notify the owner.
- [ ] First outbound message sets first response time and moves New → In conversation.
- [ ] Contract files are stored privately and only downloadable by admins.

---

### 7.15 Settings — `/admin/settings` (`Admin-Settings.dc.html`)

**Layout**
1. `PageHeader` "Settings", description "Rules that apply across every organization. Changes are logged with who made them." Right: unsaved-changes pill ("{n} unsaved changes"), **Discard**, **Save changes** (primary; disabled when clean). Warn on navigation with unsaved changes.
2. Two columns: left section nav (anchors with icons, highlights the section in view), right sections:
   - **Overwatch threshold** (`#overwatch`): sentence control "Flag a unit after [− 3 +] violations within [30 days ▾]" (count 2–10; window 14/30/60/90), "Changed" pill when dirty, live preview line "With these settings, **{n} units** across {m} properties are flagged today." (from `/overwatch-preview`), checkbox "Count dismissed violations" (default off).
   - **Resident issue types** (`#issues`): sortable table (drag handle + keyboard reorder) with Label, Spanish label, Reply target (4/12/24/48 h), On form switch; **Add issue type**. Keys are generated from the label and immutable.
   - **Violation types** (`#violations`): cards with label, Spanish label, Active switch, "Counts for Overwatch" / "Log only" toggle pill, "{n} this month"; **Add violation type**. Inactive types are dimmed and hidden from the valet app.
   - **Service nights and holidays** (`#calendar`): day toggles Sun–Sat (default Sun–Thu selected) with start time (8:00 PM); **No-service holidays** list (calendar tile with month/day, name, note computed from weekday and make-up policy, remove); **Add date** (date + name); select "When a holiday falls on a service night": Make up the next night / Skip, no make-up.
   - **Weekly reports and email** (`#reports`): Send day, Send time (Eastern), Reports sent from (office@), Quotes sent from (quotes@). Sender addresses must be verified domains in the email provider; show a warning if not.

**Acceptance**
- [ ] Saving writes `settings` / `issue_types` / `violation_types` / `holidays` and one audit entry per section changed.
- [ ] The public Residents page and report form read issue types and holidays from `/settings/public`.
- [ ] The valet app shows only active violation types in the saved order.

---

## 8. Integrations

### 8.1 Google Places (address lookahead) and maps

- Use the **Places API (New)** through the Maps JavaScript API: `google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions` with an `AutocompleteSessionToken` per modal session (cheaper billing), `includedRegionCodes: ["us"]`, `locationBias` circle around Atlanta (33.749, −84.388, 60 km). On select, `place.fetchFields({ fields: ["formattedAddress", "addressComponents", "location", "displayName", "id"] })`.
- Parse `addressComponents`: `street_number` + `route` → address, `locality` (fallback `sublocality`/`postal_town`) → city, `administrative_area_level_2` → county (strip " County"), `postal_code` → ZIP.
- Static map previews: Maps Static API, 600×260, one marker, `scale=2`.
- Load the script lazily the first time the Add property modal opens (`@googlemaps/js-api-loader`).
- **Key:** new public variable `VITE_GOOGLE_MAPS_API_KEY`. Per `claude.md`: add to `.env.example` (blank, with instructions) and `.env.local` (blank for the owner to fill), plus the production environment settings. In Google Cloud: restrict by HTTP referrer (`https://cbenvironments.com/*`, `https://staging.cbenvironments.com/*`, `https://testadmin.cbenvironments.com/*`, `http://test.cbenvironments.com:5174/*`) and by API (Maps JavaScript API, Places API (New), Maps Static API). Set a daily quota.
- Fallback: if the key is missing or Google fails, the address field behaves as a plain input and a muted note says "Address suggestions are unavailable right now."

### 8.2 Email

- **Outbound** uses the provider cbes-api already uses for "Email me this report" (Resend per `BUILD_BRIEF.md`). Verify `cbenvironments.com` and add senders `office@` (reports, resident replies, notifications) and `quotes@` (quotes and contracts).
- **Quote replies (inbound):** recommended path on your Cloudflare stack is **Cloudflare Email Routing → Email Worker** for `quotes@cbenvironments.com`:
  1. Outbound quote emails set `Reply-To: quotes@cbenvironments.com` and a unique `Message-ID`; store it on the `quote_messages` row.
  2. The Email Worker (an `email()` handler in cbes-api, or a small worker that POSTs to `/api/email/inbound` with a shared secret) parses the message (`postal-mime`), matches the quote by `In-Reply-To` / `References` → stored Message-IDs, then by the sender address on open quotes, then by `quotes+{email_thread_token}@` if subaddressing is enabled.
  3. Unmatched mail is forwarded to office@ and creates a **New** quote card ("From email").
  4. Also forward a copy of every inbound message to a real mailbox so nothing is lost if the worker fails.
- **Notification emails** (violation notes, reports due, stale invites): one template with title, body, button to the app link; send immediately, never batch notes.
- **Bounces:** subscribe to the provider's bounce webhook → mark `weekly_report_runs.status = 'bounced'` and create an admin notification.

### 8.3 File storage (R2)

- One private bucket (e.g. `cbes-files`) with prefixes: `violations/{violationId}/`, `properties/{propertyId}/`, `organizations/{orgId}/`, `quotes/{quoteId}/`, `uploads/tmp/` (24 h lifecycle rule).
- Uploads go through the API (size and type checked; images re-encoded to WebP, EXIF stripped except capture time and GPS for violation photos, which are moved to columns before stripping).
- Downloads use short-lived signed URLs (1 h) issued by the API after the permission check. Never expose bucket URLs.
- Retention [decision needed]: suggest violation photos 24 months, then delete.

### 8.4 Connecteam

- Existing integration powers weekly report clock-ins. Reuse it for **Tonight's service** (Overview) and **CBES team** on-shift tags (Property detail): match `property_staff.connecteam_user_id` and `properties.connecteam_job_id`. Cache tonight's data for 2 minutes.

### 8.5 PDFs and ZIP

- Property weekly PDF: keep the existing client-side `src/lib/report-pdf.ts` (jsPDF, loaded on click).
- Org PDF: fetch each property's report, render a summary page (org totals) plus one section per property with the same builder.
- ZIP: client-side with `fflate` (lazy-loaded) of all property PDFs for the week.
- Scheduled Monday sends are server-side (cbes-api cron at 11:00 and 12:00 UTC, sending only when it's 7 AM in New York). The email contains the summary and a link; attach a server-rendered PDF in a later iteration if needed.
- Quote PDF: generated server-side or client-side with jsPDF using the brand (logo, navy header, gold rule), then stored as a `quote_pdf` document.

---

## 9. Build order and milestones

Build in this order; each milestone ends with its checks passing and a review before the next.

| # | Milestone | Includes | Done when |
| --- | --- | --- | --- |
| M0 | Foundations | Roles (`super_admin`, Steward label), tokens, `AdminShell`, sidebar/top bar, components in 4.4, charts in 4.6, nav counts, global search shell, notifications popover, redirects for Properties | `pnpm typecheck && pnpm lint && pnpm test` pass; every admin route renders in the new shell; axe clean |
| M1 | Organizations and properties | Migrations 0006–0007, org list (tiles/list), org detail (tabs, aside), Add property modal with Google Places and photo upload, property detail (Overview, Team, Settings, Weekly), representative access to the same pages | Rep can add properties to own org up to 100; admin-only fields hidden for reps; e2e: create org → add property with invites |
| M2 | Violations | Migrations 0008–0009, valet create endpoint, list (stages, filters, list/grid, bulk), detail (gallery, notes with notify, status, reassign, unit history), property-side read endpoints, notification emails | API tests prove property-side users never see New/In review or CBES-only notes; e2e: log violation → note pings valet + Steward |
| M3 | Reports | Summary + list endpoints, filters/saved views, charts, table with reply clock, drawer with reply to resident, phone reports, CSV | Numbers match Overview; reply clock thresholds tested |
| M4 | Users and admins | Users list (merged Clerk + memberships + invites), row actions, staff invitations, step-up verification, Add admin modal, audit log | Admin cannot upgrade; super_admin can with step-up; audit entries written |
| M5 | Weekly reports (admin) | 0012 runs, admin view, send property/org/all, org PDF, ZIP, next run card, bounce handling | Manual sends logged; bounced rows flagged |
| M6 | Quotes | 0010, public `POST /quotes` from cbes-web, pipeline + list, conversation with quotes@ outbound, inbound Email Worker, documents/contract send, convert to org | Round trip: send from portal → reply from Gmail → appears in thread |
| M7 | Settings, Overview, Overwatch stub | 0011, settings screen, public settings endpoint, Overview aggregates, Overwatch preview | Overview KPIs equal page totals; settings changes reflected in valet app and public form |

---

## 10. Testing and acceptance

- **Unit (Vitest):** `access.ts` role/area table; reply-clock state; overwatch counting rules; date range helpers (America/New_York, Sunday weeks); address component parsing; quote total math.
- **Component (Testing Library, existing `src/test/render.tsx`):** each page with mocked `useApi` for loading, empty, error and populated states; filter → URL sync; modals trap focus and close on Escape.
- **API (cbes-api):** table-driven permission tests for every row of 2.2 (role × endpoint → 200/403/404); limit 100 → 409; step-up required → 403; CBES-only notes hidden.
- **E2E (Playwright, existing config, desktop + Pixel 7):** org → property → invite; violation review flow; report reply; add admin with step-up (mock WebAuthn); quote email round trip (staging only).
- **Accessibility:** `@axe-core/playwright` on every admin route (already a dependency); zero serious/critical issues.
- **Performance:** admin routes lazy-loaded per section; initial admin JS < 250 kB gzip; lists paginate server-side; charts render < 16 ms.

---

## 11. Open questions

1. **Steward** = the `lead` role (a valet's direct manager)? This spec assumes yes and only changes the label.
2. Violation statuses New → In review → Sent to property → Resolved / Dismissed: OK? Can property managers mark Resolved themselves (spec: yes)?
3. When CBES sends violations, should property managers get one digest per day or an email per violation (spec: one digest per send action)?
4. Inbound email: OK to use Cloudflare Email Routing for quotes@, or does the email provider handle inbound?
5. Contract signing: upload signed copies back (spec) or add an e-signature service later?
6. Photo retention period (suggest 24 months).
7. Org brand colors: derive from the uploaded logo, pick from a palette, or keep navy for all?
8. Who besides Nick and Nigel receives the all-properties roll-up?

---

## Appendix A. Using this spec with Claude Code

1. Keep this file and `docs/design/admin/` in the repo (already copied there).
2. Start each milestone in Claude Code from the repo root with a prompt like:

```
Read docs/ADMIN_PORTAL_SPEC.md sections 1–4, then section 9 milestone M1 and the screens it lists in section 7.
Open the matching design files in docs/design/admin/ (see docs/design/admin/README.md for how to read them).
Implement M1 in this repo using the existing patterns (useApi, React Query, ui.tsx, Tailwind tokens, RequireArea).
List the cbes-api endpoints and migrations M1 needs from sections 5–6 as a separate checklist for the API repo.
Follow claude.md for any new environment variable. Run pnpm typecheck, lint and test, then stop and summarize.
```

3. Do the matching cbes-api work in that repo with the same spec sections (5, 6 and 2.2).
4. After each milestone, update the Open questions and tick the acceptance boxes in section 7.
