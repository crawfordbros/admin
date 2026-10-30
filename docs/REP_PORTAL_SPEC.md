# CBES Rep Portal — Implementation Spec

Version 1.0 · October 28, 2026 · Owner: Nick Crawford (Super Admin)
Repo: `cbes-admin` (this repo) · API: `cbes-api` (sibling repo, serves `/api/*`)
Design reference: `docs/design/rep/` (one file per screen, exported from the Claude Design canvas "CBES Website Design", page "Rep Portal")
Live design canvas: https://claude.ai/artifact/JxU3ogQQZjDDjHNKxZyXSk (open the "Rep Portal" page; private to Nick until shared, so Claude Code reads the exported files in `docs/design/rep/` instead)
Companion spec: `docs/ADMIN_PORTAL_SPEC.md` (roles, shared components, data model, admin screens)

This spec covers the **property side** of the portal: what an organization's **Representatives** and its **Property managers / Management Directors** see and do after signing in at `/portal`. It replaces today's plain portal pages (`PortalHome`, `OrganizationView` in the portal area, `PropertyPage`, `PortalViolationPage`) with the designed "Property Portal": a sidebar layout, a Representative dashboard, a property home, violations, resident issues, reports, and team settings.

Where this spec and `ADMIN_PORTAL_SPEC.md` disagree about property-side users, **this spec wins**. Section 2.3 lists every change to existing rules and code.

> Read order for an implementer (human or Claude Code): sections 0–4 first, then the screen you are building in section 7, its API in section 6 and its tables in section 5. Section 9 is the build order.

---

## Contents

0. Owner decisions (October 28, 2026)
1. Scope
2. Roles and permissions
3. Routes and navigation
4. Shared UI
5. Data model changes (cbes-api, D1)
6. API contract
7. Screen specs (8 screens + shell)
8. Notifications and email
9. Build order and milestones
10. Testing and acceptance
11. Open questions
Appendix A. Using this spec with Claude Code

---

## 0. Owner decisions (October 28, 2026)

These come straight from Nick and override anything older:

1. **No account approval step.** CBES creates the Organization and invites its Representative; that invitation *is* the approval. Do not add a "pending approval" state, screen, or flag. (A "waiting for approval" design existed briefly and was removed.)
2. **No CBES wait to add properties or managers.** Once signed in, a Representative adds properties (up to the organization's `property_limit`, 100 by default) and invites managers immediately. A new property is live at once. CBES is *notified* so it can assign a Steward, link Connecteam and print QR codes, but nothing blocks on CBES.
3. **Only Representatives add managers.** Property managers and Management Directors never invite anyone.
4. **Managers are largely view-only.** They can work **violations**: update the status and add comments. Everything else they see is read-only.
5. **The property closes violations; CBES closes resident issues.** Violations are reported *to* the property and handled *by* the property. Resident issues are handled by CBES staff; property-side users get **view-only transparency**.

---

## 1. Scope

### 1.1 In scope

| # | Screen | Route | Design file | Who |
| --- | --- | --- | --- | --- |
| 1 | Representative dashboard | `/portal/organizations/:orgId` | `Rep-Dashboard.dc.html` | Representative |
| 2 | Property home | `/portal/properties/:propertyId` | `Rep-ManagerDashboard.dc.html` | Manager, Director, Representative |
| 3 | Add property (modal) | `/portal/organizations/:orgId/properties/new` | `Rep-AddProperty.dc.html` | Representative |
| 4 | Team and settings | `/portal/organizations/:orgId/settings` | `Rep-Settings.dc.html` | Representative |
| 5 | Violations (list) | `/portal/violations` | `Rep-Violations.dc.html` | All property-side |
| 6 | Violation detail | `/portal/violations/:violationId` | `Rep-ViolationDetail.dc.html` | All property-side |
| 7 | Resident issues (list + detail) | `/portal/issues`, `/portal/issues/:reportId` | `Rep-Issues.dc.html` | All property-side |
| 8 | Reports | `/portal/reports` | `Rep-Reports.dc.html` | All property-side |
| 9 | My account (no design; reuse cards from #4) | `/portal/account` | — | Manager, Director |
| — | Sidebar, top bar | shell | `RepSidebar.dc.html`, `RepTopbar.dc.html` | All property-side |

The existing printable weekly report page `/portal/properties/:id/report` (`WeeklyReportPage`) stays as is; Reports links to it for "View".

### 1.2 Out of scope

- Overwatch actions (Phase 2). The property home shows repeat units read-only with a disabled "Put on Overwatch · coming soon" button.
- Replying to residents, changing a resident issue's status, or assigning it (CBES only).
- Inviting Representatives (admin only, unchanged).
- Editing service fields CBES owns: Steward, Connecteam job, contract term, organization status.
- Billing and invoices.

### 1.3 Principles

All principles in `ADMIN_PORTAL_SPEC.md` 1.3 apply. In particular:

- **The API decides access.** The client hides controls by role; every endpoint re-checks organization and property membership.
- **Property-side users see a violation only once CBES sends it** (`status IN ('sent','resolved')`) and only `visibility = 'property'` events.
- **Residents never get violation notices from CBES.** Courtesy notices are generated for the *property* to send.
- **Every list is URL-addressable** (scope, tab, filters, page in the query string).
- **No new environment variables are expected.** If one turns out to be needed, follow `claude.md` (both `.env.example` and `.env.local`, never real values).

---

## 2. Roles and permissions

### 2.1 Who's who on the property side

| Role (stored) | UI label | Scope | Summary |
| --- | --- | --- | --- |
| `representative` | Representative | Every property in their organization(s), now and later (`organization_members`) | Leads the organization. Adds properties, assigns and invites managers, sees everything, works violations, gets the org roll-up report. |
| `director` | Management Director | The properties they are a member of (`property_members`) | Same access as a manager, across several properties. Always receives the weekly report for their properties. |
| `manager` | Property manager | The properties they are a member of | Mostly view-only. Works violations (status + comments). Sees resident issues and reports. |

No change to `src/access.ts` roles or areas is needed. The `organization` area (super_admin, admin, representative) gates rep-only routes; the `manager` area gates the rest.

### 2.2 Permission matrix (property side)

✓ = allowed within their scope · — = not allowed

| Action | Representative | Director | Property manager |
| --- | --- | --- | --- |
| Representative dashboard (org-wide) | ✓ | — | — |
| Property home | ✓ | ✓ | ✓ |
| Add property (no approval; up to `property_limit`) | ✓ | — | — |
| Edit property basics (name, photo, units, buildings, trash-out window) | ✓ | — | — |
| Assign / unassign managers and Directors on a property | ✓ | — | — |
| Invite Property managers | ✓ | — | — |
| Invite Management Directors | ✓ (**changed**, was admin only) | — | — |
| Invite Representatives | — (admin only) | — | — |
| Resend / revoke manager or Director invitations | ✓ | — | — |
| Remove a manager's or Director's access | ✓ | — | — |
| Edit organization profile (name, logo, phone, billing email) | ✓ | — | — |
| View violations (sent and resolved only) | ✓ | ✓ | ✓ |
| Update violation status: Sent → Resolved, Resolved → Sent (reopen) | ✓ (**changed**, see 11.1) | ✓ | ✓ |
| Add violation comment (property-visible) | ✓ | ✓ | ✓ |
| Download courtesy notice PDF | ✓ | ✓ | ✓ |
| View resident issues (full details, CBES replies) | ✓ | ✓ | ✓ |
| Change issue status, reply, assign, comment | — | — | — |
| Follow an issue ("Email me updates") | ✓ | ✓ | ✓ |
| View and download weekly reports (property) | ✓ | ✓ | ✓ |
| Organization roll-up report, ZIP of all properties | ✓ | — | — |
| "Email me" a report | ✓ | ✓ | ✓ |
| Own notification preferences | ✓ | ✓ | ✓ |

### 2.3 Changes to existing rules and code

| # | Change | Where today | What to do |
| --- | --- | --- | --- |
| C1 | **No approval state.** | — | Do not add one. A Representative who finishes the invite and two-step setup lands on their dashboard. |
| C2 | **Rep-created properties are live immediately.** | `api/src/routes/organizations.ts` `POST /:id/properties` already sets `status: "active"` | Keep. Add: notify CBES admins (section 8, `property_added_by_rep`) and add an admin Overview attention item `property_needs_setup` for properties with no `steward_user_id` or no `connecteam_job_id`. Never show "Awaiting CBES setup" to the property. A future `service_start_date` shows as "Starting {date}" (existing `starting` flag). |
| C3 | **Reps may invite Directors.** | `organizations.ts`: `REP_INVITES_MANAGERS` check in `POST /:id/invitations` (~line 518) and in the invite loop of `POST /:id/properties` (~line 337) | Allow `role IN ('manager','director')` for representatives; keep `representative` admin-only. Update the message to "Representatives can invite property managers and Management Directors. Ask CBES to add another Representative." Client: `AddPropertyModal.tsx` role select (~line 415) and `OrganizationView.tsx` invite modal (~line 681). |
| C4 | **Violation status for the property: resolve and reopen, with how it was handled.** | `api/src/routes/violations.ts` `portalViolations.patch("/violations/:id")` only allows `sent → resolved` for `side.manager` | Accept `{ status: "resolved", resolution, note? }` from `sent` and `{ status: "sent", note? }` from `resolved` (reopen). Allow `side.manager` (manager/Director) **and** `side.representative`. Store `resolution` and `resolved_by` (5.1). Write a `violation_events` row `kind='status'`, `visibility='property'`, body = optional note. Client: `PortalViolationPage` `canResolve` → `canUpdate` for manager, director, representative. |
| C5 | **Resident issues are view-only for the property.** | Property side sees only `PropertyOverview.recentReports` today | Add read-only portal endpoints (6.5). Property-side users get no endpoint that changes a report other than follow/unfollow. Internal CBES `comment` events and `call` bodies are never returned. |
| C6 | **Org profile fields.** | `PATCH /organizations/:id` lets reps change `name` only | Also allow `phone` and `billingEmail` (new columns, 5.1). Logo endpoints already allow reps. |
| C7 | **Portal layout.** | `src/components/Shell.tsx` (top header only) | Replace with `RepShell` (sidebar + top bar, section 4.2) for every `/portal/*` page except login and accept-invite. |
| C8 | **Portal organization page.** | `/portal/organizations/:id` renders `OrganizationView` with tabs Properties / People / Invitations | Render `RepDashboardPage` instead. People and Invitations move to Team and settings. Redirect `?tab=people` and `?tab=invitations` to `/portal/organizations/:id/settings`. `OrganizationView` stays for the admin area only. |

---

## 3. Routes and navigation

### 3.1 Route table (`src/App.tsx`)

All routes sit inside the existing `<RequireSecurity>` and the new `<RepShell>`.

| Route | Guard | Component | Notes |
| --- | --- | --- | --- |
| `/portal` | `portal` | `PortalHome` (keep redirects) | Admins → `/admin`. One organization → its dashboard. No organization and one property → property home. Otherwise a chooser (existing, restyled with cards). |
| `/portal/organizations/:orgId` | `organization` | `RepDashboardPage` | Query: `filter=all|violations|issues` for the attention list |
| `/portal/organizations/:orgId/properties/new` | `organization` | `RepAddPropertyModal` over the dashboard | Route-driven modal |
| `/portal/organizations/:orgId/settings` | `organization` | `TeamSettingsPage` | Query: `tab=team|invitations|organization|notifications` |
| `/portal/properties/:propertyId` | `manager` | `PropertyHomePage` | Rebuilds `PropertyPage`; keep `?as=manager` admin preview (`useManagerPreview`) |
| `/portal/properties/:propertyId/report` | `manager` | `WeeklyReportPage` (existing) | Unchanged |
| `/portal/violations` | `manager` | `RepViolationsPage` | Query: `org`, `property`, `status=to_review|resolved|all` (default `to_review`), `type`, `from`, `to`, `q`, `repeat=1`, `page` |
| `/portal/violations/:violationId` | `portal` | `PortalViolationPage` (rebuilt) | Keep `portal` guard: valets and Stewards also open this page from notifications |
| `/portal/issues` | `manager` | `RepIssuesPage` | Query: `org`, `property`, `tab=open|resolved|all`, `page` |
| `/portal/issues/:reportId` | `manager` | `RepIssuesPage` with the detail pane open | Deep-linkable; on screens < 1024 px the detail replaces the list |
| `/portal/reports` | `manager` | `RepReportsPage` | Query: `scope=organization|property`, `org`, `property`, `week=YYYY-MM-DD` (Sunday) |
| `/portal/account` | `manager` | `AccountPage` | Notifications + sign-in methods for managers and Directors |

**Scope rule for list pages.** `org` and `property` are mutually exclusive. If neither is set:
- A Representative with one organization defaults to `org={thatOrg}`; with several, to the org shown in the sidebar switcher (last used, then first).
- A manager or Director defaults to the property in the sidebar switcher (last used, then first).
The API rejects any `org` or `property` outside the caller's scope with 404.

"Last used" lives in `localStorage` (`cbes.portal.context`), wrapped in try/catch; the URL always wins.

### 3.2 Sidebar (`RepSidebar.dc.html`)

```ts
export const REP_NAV = {
  representative: [
    { group: "Portfolio", items: [
      { to: (ctx) => `/portal/organizations/${ctx.orgId}`, label: "Dashboard", icon: "grid" },
      { to: (ctx) => `/portal/violations?org=${ctx.orgId}`, label: "Violations", icon: "alert-triangle", badge: "violationsToReview" },
      { to: (ctx) => `/portal/issues?org=${ctx.orgId}`, label: "Resident issues", icon: "message", badge: "openIssues" },
      { to: (ctx) => `/portal/reports?scope=organization&org=${ctx.orgId}`, label: "Reports", icon: "bar-chart" },
    ]},
    { group: "Organization", items: [
      { to: (ctx) => `/portal/organizations/${ctx.orgId}/settings`, label: "Team and settings", icon: "user-plus", badge: "pendingInvitations", badgeTone: "gold" },
    ]},
  ],
  propertyStaff: [ // manager and director
    { group: "Property", items: [
      { to: (ctx) => `/portal/properties/${ctx.propertyId}`, label: "My property", icon: "grid" },
      { to: (ctx) => `/portal/violations?property=${ctx.propertyId}`, label: "Violations", icon: "alert-triangle", badge: "violationsToReview" },
      { to: (ctx) => `/portal/issues?property=${ctx.propertyId}`, label: "Resident issues", icon: "message", badge: "openIssues" },
      { to: (ctx) => `/portal/reports?scope=property&property=${ctx.propertyId}`, label: "Reports", icon: "bar-chart" },
      { to: null, label: "Overwatch", icon: "eye", tag: "Phase 2", disabled: true },
    ]},
    { group: "Account", items: [
      { to: () => "/portal/account", label: "My account", icon: "settings" },
    ]},
  ],
};
```

- Header: logo (`logo-gold-on-navy.webp`) + "Property Portal" / "by CB Environment Solutions", linking to the user's home.
- **Context switcher** under the header: org tile (logo or initials) + name + "N properties · Representative" for reps; property tile + name + organization name for managers. It opens a `Menu` listing every organization (reps) or property (managers/Directors with more than one); choosing one updates the URL and `cbes.portal.context`. With a single option it is static (no chevron).
- Footer card: "Need CBES?" · "We reply within 24 hours." · `mailto:office@cbenvironments.com`; then "Aiming for Excellence".
- Badges from `GET /portal/nav-counts` (6.1), refreshed every 60 s and on focus. Red pill for counts, gold pill for pending invitations, muted pill "Phase 2".

### 3.3 Top bar (`RepTopbar.dc.html`)

- Breadcrumb: "{Organization or property name} / {Page} / {item}".
- Search field: properties, units, violation numbers (V-2041), issue numbers (#1042) within scope; `GET /portal/search?q=` (6.1). ⌘K / Ctrl+K opens the same palette component as admin (`SearchPalette`) in "portal" mode.
- Notifications bell (existing `Notifications` component and `/notifications` API).
- User block: avatar, name, role label; opens Clerk `UserButton`.
- Remove the design's "Sample data" chip.

---

## 4. Shared UI

### 4.1 Reuse first

Reuse everything built for the Admin Portal: tokens in `src/index.css`, `src/components/ui.tsx`, `controls.tsx`, `display.tsx` (`PageHeader`, `KpiTile`, `StatTile`, `Pill`, `StatusBadge`, `Avatar`, `EmptyState`, `Skeleton`), `DataTable`, `FilterBar`, `Popover`, `overlay.tsx` (`Modal`, `Drawer`), `Toast`, `icons.tsx`, `charts/charts.tsx` (`GroupedBars`, `HBarList`, `Legend`, `ChartTable`), `AddressField`, `src/lib/places.ts`, `report-pdf.ts`. Do not fork admin components; add a `variant` prop if a portal screen needs a small difference.

### 4.2 `RepShell` (replaces `Shell.tsx` for `/portal/*`)

- Same geometry as `AdminShell` (ADMIN_PORTAL_SPEC 4.2): 248 px `bg-navy-ink` sidebar, 64 px white top bar, content `px-8 py-7` on `canvas`; below 1024 px the sidebar becomes a slide-over drawer.
- Holds the portal context (`orgId` or `propertyId`) in a `RepContext` provider derived from the route and query string, falling back to `cbes.portal.context`.
- Every page sets `document.title` as `"{Page} | CBES Portal"`.
- Keep `PortalSessionActivity` and the session boundary exactly as today (`docs/PORTAL_SESSIONS.md`).
- Admins previewing (`?as=manager`) see a slim gold banner "Previewing as a property manager · Exit preview" above the top bar (existing preview logic).

### 4.3 Property-side status labels

Property users see **their** next step, not CBES's internal stage.

| Kind | Stored | Property label | Colors |
| --- | --- | --- | --- |
| Violation | `sent` | **To review** | `warning-bg / warning` |
| Violation | `resolved` | **Resolved** | `success-bg / success` |
| Issue | `new` (no `first_response_at`) | **New** | `info-bg / info` |
| Issue | `assigned`, `in_progress` with `first_response_at` | **CBES replied** | `success-bg / success` |
| Issue | `assigned`, `in_progress` without `first_response_at` | **CBES is on it** | `info-bg / info` |
| Issue | `resolved`, `closed` | **Resolved** | `neutral-bg / neutral` |
| Issue | issue type `compliment` (if configured) | **Compliment** | `gold-tint / gold-text` |
| Property | `starting` | **Starting {Mon D}** | `warning-bg / warning` |
| Property | active | **Active** | `success-bg / success` |

Add `kind: "portalViolation" | "portalIssue"` to `StatusBadge` rather than changing the admin mappings.

### 4.4 New components

| Component | Props | Notes |
| --- | --- | --- |
| `ContextSwitcher` | `{ kind: "organization" \| "property"; current; options; onChange }` | Sidebar control (3.2) |
| `AttentionList` | `{ items: AttentionItem[]; filter; onFilter }` | Dashboard "Needs your attention" rows: icon tile (violation red / issue blue), title + status badge, "{ref} · {property} · {where}", age (red when over 24 h for issues or 2 days for violations), action link |
| `PropertyCard` | `{ property: PortalPropertyCard; canAssign: boolean; onAssign }` | Photo (16:8), status badge, name, "{city} · {units} units", count pills ("{n} to review" red when > 0, "{n} open issues" blue when > 0), manager row or "No manager yet" + **Assign manager** |
| `ManagerPicker` | `{ orgId; propertyId?; value: string[]; onChange }` | Checkbox cards of org managers/Directors (avatar, name, role, property count) |
| `InviteRows` | `{ value: NewPropertyInvite[]; onChange; roles: PropertyRole[] }` | Email, name, role select, remove; "Add another" |
| `PropertyChips` | `{ properties; value; onChange }` | Multi-select pill chips (Team and settings invite form) |
| `ResolutionPicker` | `{ value; onChange }` | Radio cards for 5.1 `resolution` values |
| `IssueThread` | `{ events: PortalIssueEvent[] }` | Resident bubbles left (`canvas`), CBES bubbles right (`tint-2`); optional photo |
| `QrCode` | `{ value; size }` | Renders SVG with the `qrcode` npm package (lazy-loaded) |

---

## 5. Data model changes (cbes-api, D1 / SQLite)

Existing tables used: `organizations`, `organization_members`, `properties`, `property_members` (has `receives_weekly_report`), `invitations`, `users` (has `last_seen_at`), `violations`, `violation_events`, `violation_photos`, `resident_reports`, `report_events`, `photos`, `weekly_report_runs`, `notifications`, `audit_log`, `settings`.

### 5.1 `0018_rep_portal.sql`

```sql
-- Violations: how the property handled it (Rep Portal, owner decision Oct 28 2026).
ALTER TABLE violations ADD COLUMN resolution TEXT
  CHECK (resolution IN ('courtesy_notice','spoke_with_resident','lease_violation','other'));
ALTER TABLE violations ADD COLUMN resolved_by TEXT;           -- user id; null for CBES-side resolutions

-- Organization profile fields a Representative can edit.
ALTER TABLE organizations ADD COLUMN phone TEXT;
ALTER TABLE organizations ADD COLUMN billing_email TEXT;
-- CBES person shown first under "Your CBES contacts" (admin-only field; null = office email only).
ALTER TABLE organizations ADD COLUMN account_lead_user_id TEXT;

-- Property service details a Representative sets when adding a property.
ALTER TABLE properties ADD COLUMN trash_out_window TEXT;      -- '18:00-20:00' | '19:00-21:00'; null = settings default
ALTER TABLE properties ADD COLUMN pressure_washing INTEGER NOT NULL DEFAULT 0;  -- yearly spot pressure washing requested
ALTER TABLE properties ADD COLUMN created_by TEXT;            -- user id that added the property

-- Weekly report choice carried on an invitation, applied when it is accepted.
ALTER TABLE invitations ADD COLUMN receives_weekly_report INTEGER NOT NULL DEFAULT 0;

-- "Email me updates" on a resident issue.
CREATE TABLE report_followers (
  report_id TEXT NOT NULL REFERENCES resident_reports(id) ON DELETE CASCADE,
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (report_id, user_id)
);

-- Per-user email preferences for the property side.
CREATE TABLE notification_prefs (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  violations_sent  INTEGER NOT NULL DEFAULT 1,  -- one email per CBES send to my properties
  new_issues       INTEGER NOT NULL DEFAULT 1,  -- a resident reports an issue at my properties
  issue_updates    INTEGER NOT NULL DEFAULT 1,  -- updates on issues I follow
  invite_accepted  INTEGER NOT NULL DEFAULT 0,  -- Representatives: someone I invited joined
  weekly_rollup    INTEGER NOT NULL DEFAULT 1,  -- Representatives: Monday organization roll-up
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
```

Notes:
- A user with no `notification_prefs` row gets the defaults above.
- The **property** weekly report for managers and Directors stays driven by `property_members.receives_weekly_report` (Directors always receive it, existing `propertyRecipients`). Turning "Monday weekly report" off in My account sets `receives_weekly_report = 0` on all of that user's non-Director memberships; Directors can't turn it off (the switch is disabled with "Directors always get the weekly report").
- Invitation expiry stays computed: an invitation older than 7 days shows **Expired** (resend creates a fresh Clerk invitation and resets `created_at`).

### 5.2 Derived values

- **Violations to review:** `status = 'sent'` in scope.
- **Repeat units:** same rule as Overwatch (ADMIN_PORTAL_SPEC 5.8) using `settings.overwatch.threshold`, counting only violations the property can see.
- **Open issues:** `resident_reports.status IN ('new','assigned','in_progress')` in scope.
- **Service nights:** scheduled nights from `settings.calendar.service_nights` (default Sun–Thu) minus holidays, serviced = nights with a Connecteam clock-in (existing weekly report logic). Never hard-code 7 nights; the design's numbers are illustrative.
- **Resolved by property %:** violations sent in the week that are `resolved` with `resolved_by` set to a property-side user, over violations sent that week.

---

## 6. API contract

Same conventions as ADMIN_PORTAL_SPEC 6: `/api` prefix, Clerk bearer token via `useApi()`, JSON, 422 `fieldErrors`, lists return `{ items, total, page, pageSize }`. Scope checks use the existing helpers (`isPropertySide`, organization membership). Add response types to `src/lib/api.ts`.

### 6.1 Shell

| Method | Path | Who | Response |
| --- | --- | --- | --- |
| GET | `/portal/me` | any | Extend `Me.organizations[]` with `propertyCount`, `propertyLimit`, `logoVersion`; `Me.properties[]` with `organizationName`, `photoVersion` |
| GET | `/portal/nav-counts?org=\|property=` | property side | `{ violationsToReview: number; openIssues: number; pendingInvitations: number }` (`pendingInvitations` only for reps; 0 otherwise) |
| GET | `/portal/search?q=` | property side | `{ results: { kind: "property" \| "unit" \| "violation" \| "issue"; id; title; subtitle; link }[] }`, max 20, scoped |

### 6.2 Representative dashboard

`GET /portal/organizations/:orgId/dashboard` (representative of the org, or admin)

```ts
type RepDashboard = {
  organization: { id: string; name: string; logoVersion: string | null; propertyCount: number; propertyLimit: number };
  week: { start: string; label: string };               // current Sunday-start week, America/New_York
  kpis: {
    properties: { value: number; limit: number; units: number };
    violationsToReview: number;
    openIssues: { value: number; oldestHours: number | null };
    serviceNights: { serviced: number; scheduled: number; label: string };  // this week so far, active properties
    avgFirstReplyHours30d: number | null;
  };
  attention: AttentionItem[];                            // oldest first, max 10
  properties: PortalPropertyCard[];
  violationsByNight: { date: string; day: string; count: number | null }[];   // this week; null = night not yet
  topViolationTypes: { label: string; count: number }[];                       // this week, top 2
  lastWeek: { activeProperties: number; serviced: number; scheduled: number; violationsSent: number; issues: number; allRepliedWithin24h: boolean };
  nextWeeklyReportAt: string;
  pendingInvitations: { id: string; email: string; role: PropertyRole; propertyNames: string[]; createdAt: string; expired: boolean }[];
  contacts: { id: string; name: string; title: string }[];   // account lead first, then Stewards with their properties
};
type AttentionItem = {
  kind: "violation" | "issue"; id: string; ref: string;      // "V-2041" | "#1042"
  title: string; statusLabel: string; propertyId: string; propertyName: string; where: string; ageHours: number; link: string;
};
type PortalPropertyCard = {
  id: string; name: string; city: string | null; units: number | null; photoVersion: string | null;
  status: "active" | "starting" | "inactive"; serviceStartDate: string | null;
  violationsToReview: number; openIssues: number;
  managers: { id: string; name: string; role: PropertyRole }[];   // first manager shown; "+N" for more
};
```

### 6.3 Property home

Extend the existing `GET /portal/properties/:id` (`PropertyOverview`) — keep current fields for backward compatibility and add:

```ts
type PropertyHome = PropertyOverview & {
  organization: { id: string; name: string };
  header: { address: string | null; buildings: number | null; units: number | null; serviceNightsLabel: string; trashOutWindow: string; pressureWashingNext: string | null };
  kpis: {
    violationsToReview: number;
    resolved30d: { value: number; avgDaysToResolve: number | null };
    openIssues: { value: number; lastReplyHours: number | null };
    serviceNights: { serviced: number; scheduled: number };      // this week so far
    repeatUnits: number;
  };
  violationsToReview: ViolationRow[];                 // status 'sent', oldest first, max 5
  issues: PortalIssueRow[];                           // latest 5 (open first)
  repeatUnits: { unit: string; building: string | null; count: number; types: string }[];
  tonight: { isServiceNight: boolean; startsAt: string; steward: PersonRef | null;
             valets: { id: string; name: string; area: string | null }[];
             lastNight: { date: string; buildingsDone: number | null; buildings: number | null; firstClockIn: string | null; lastClockOut: string | null; violations: number } | null };
  team: { members: { id: string; name: string; role: PropertyRole; receivesWeeklyReport: boolean; you: boolean }[]; representatives: PersonRef[] };
  reportLink: { url: string };                        // `${config.siteUrl}/report?p=${slug}`
  canManage: boolean;                                 // true for reps/admins: show Edit and Manage team
};
```

`valets[].area` is optional free text (e.g. "Bldgs 1–2"); show "Valet" alone when null. Tonight's data reuses the Connecteam cache from ADMIN_PORTAL_SPEC 8.4.

### 6.4 Violations (property side)

| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| GET | `/portal/violations` | property side | Query in 3.1. Only `status IN ('sent','resolved')`. Returns `ViolationList & { statusCounts: { toReview; resolved; all } }`. Each row adds `unitCount30d`, `repeat: boolean` |
| GET | `/portal/violations/export.csv` | property side | Same filters. Columns: ref, type, property, building, unit, logged at, sent at, status, resolution, resolved at |
| GET | `/portal/violations/:id` | existing | Add `resolution`, `resolvedBy`, `sentBy` (CBES reviewer name), `sentAt` to `ViolationDetail` |
| PATCH | `/portal/violations/:id` | manager, Director, rep (**C4**) | `{ status: "resolved", resolution: Resolution, note?: string }` from `sent`; `{ status: "sent", note?: string }` from `resolved`. 409 if the transition isn't allowed. `note` becomes a property-visible status event |
| POST | `/portal/violations/bulk` | same | `{ ids: string[], status: "resolved", resolution }` → `{ changed: number, skipped: { id, reason }[] }` |
| POST | `/portal/violations/:id/notes` | existing | Property-visible comment; notifies the Steward and CBES admins (existing `addNote` rules) |
| GET | `/portal/properties/:id/violations` | existing | Keep (used by property home) |

```ts
type Resolution = "courtesy_notice" | "spoke_with_resident" | "lease_violation" | "other";
```

`other` requires `note` (422 `{ note: "Tell CBES what you did." }`).

**Courtesy notice PDF** is generated client-side (jsPDF, same loader as `report-pdf.ts`) from `ViolationDetail`: organization logo (fallback: name), property name and address, "To the resident of Unit {unit}", date, violation type and night, the first photo, a short paragraph [placeholder copy, Nick to confirm], and the property's office phone (`organizations.phone`). It never names the valet or CBES staff. Bulk: one multi-page PDF for the selected violations.

### 6.5 Resident issues (property side, read-only)

| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| GET | `/portal/issues` | property side | Query: `org`, `property`, `tab=open\|resolved\|all`, `page`. Returns `{ items: PortalIssueRow[], total, page, pageSize, tabCounts: { open; resolved; all } }` |
| GET | `/portal/issues/:id` | property side | `PortalIssueDetail` (below) |
| GET | `/portal/issues/:id/photos/:photoId` | property side | Image stream (existing `serveImage`) |
| POST / DELETE | `/portal/issues/:id/follow` | property side | Adds/removes `report_followers` row → `{ following: boolean }` |
| GET | `/portal/issues/export.csv` | property side | Same filters, no resident contact columns |

There is **no** PATCH, reply, assign or comment endpoint for property-side users. Admin endpoints under `/admin/reports/*` keep rejecting them (403).

```ts
type PortalIssueRow = {
  id: string; refNo: number; issueLabel: string; createdAt: string;
  propertyId: string; propertyName: string; building: string | null; unit: string | null;
  statusLabel: "New" | "CBES is on it" | "CBES replied" | "Resolved" | "Compliment";
  replyClock: ReplyClock;                     // existing type
};
type PortalIssueDetail = PortalIssueRow & {
  resident: { name: string; email: string | null; phone: string | null; okToCall: boolean };   // fully visible to the property (owner decision)
  description: string | null;
  photos: { id: string; url: string }[];
  assignee: PersonRef | null;                 // "Assigned at CBES"
  firstReplyHours: number | null;
  following: boolean;
  events: PortalIssueEvent[];
};
type PortalIssueEvent =
  | { kind: "created"; at: string; body: string | null; photo: boolean }
  | { kind: "reply"; at: string; actor: { name: string; title: string }; body: string }      // CBES → resident
  | { kind: "call"; at: string; actor: { name: string; title: string } }                     // body never returned
  | { kind: "status"; at: string; label: string };                                           // only to Resolved/Closed
```

Never return `report_events` with `kind = 'comment'` or `'assigned'` events' internal bodies.

### 6.6 Reports (property side)

| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| GET | `/portal/reports/summary` | property side | Query: `scope=organization&org=` (reps) or `scope=property&property=`; `week` (Sunday). Returns `PortalReportSummary` |
| GET | `/portal/reports/history` | property side | Same scope. `weekly_report_runs` rows for the scope: `{ weekStart, sentAt, recipients: number, status }[]` (last 12) |
| GET | `/portal/reports/organization/:orgId/pdf?week=` | rep | Org roll-up PDF (same builder as admin, ADMIN_PORTAL_SPEC 8.5) |
| POST | `/portal/reports/email-me` | property side | `{ scope, id, week }` → emails the caller only (generalizes existing `/portal/properties/:id/report/email`) |
| GET | `/portal/properties/:id/report` | existing | Single-property report content; property PDF stays client-side; ZIP client-side with `fflate` |

```ts
type PortalReportSummary = {
  scope: { kind: "organization" | "property"; id: string; name: string };
  week: { start: string; end: string; label: string };
  kpis: {
    serviceNights: { serviced: number; scheduled: number; activeProperties: number };
    violationsSent: { value: number; previous: number };
    resolvedByProperty: { value: number; pct: number | null };
    residentIssues: { value: number; previous: number };
    avgFirstReplyHours: { value: number | null; allUnder24h: boolean };
    compliments: number;
  };
  trend: { weekStart: string; sent: number; resolvedByProperty: number }[];   // 8 weeks
  byType: { label: string; count: number }[];
  issuesSummary: string;                     // server-composed sentence, e.g. "4 issues: 2 missed pickups, ..."
  byProperty: { propertyId: string; name: string; managerName: string | null; nights: string;   // "5 of 5" | "Starts Nov 9"
                violations: number; resolved: number; issues: number; avgReplyHours: number | null; repeatUnits: number }[];  // organization scope only
  recipients: { name: string; scope: string }[];   // who gets the Monday email for this scope
  nextRunAt: string;
};
```

### 6.7 Properties, team and organization (Representatives)

| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| POST | `/organizations/:orgId/properties` | existing (admin, rep) | Add body fields `managerUserIds?: string[]` (existing org members to attach as their current role), `trashOutWindow?`, `pressureWashing?: boolean`. Invites accept `role: "manager" \| "director"` from reps (**C3**). Sets `created_by`. On success by a rep: notify admins (8.1). Still 409 `limit_reached` at the limit |
| PATCH | `/organizations/:orgId/properties/:propertyId` | existing | Reps may also set `trashOutWindow`, `pressureWashing` |
| POST | `/organizations/:orgId/properties/:propertyId/members` | rep, admin | `{ userId, role?: PropertyRole }` → attach an existing org manager/Director (role defaults to their current role). 422 if the user isn't in this org |
| DELETE | `/organizations/:orgId/properties/:propertyId/members/:userId` | existing | Unassign |
| GET | `/organizations/:orgId/team` | rep, admin | `TeamMember[]` (below): reps + every property member in the org, one row per person |
| PATCH | `/organizations/:orgId/team/:userId` | rep, admin | `{ role?: PropertyRole; propertyIds?: string[]; receivesWeeklyReport?: boolean }` — not for representatives (403) |
| DELETE | `/organizations/:orgId/team/:userId` | rep, admin | Removes all of that person's property memberships in this org; if they have none left anywhere, deactivates portal access (existing removal helper). Not for representatives (admin only) |
| POST | `/organizations/:orgId/invitations` | existing | Reps: `role IN ('manager','director')` (**C3**); add `receivesWeeklyReport?: boolean` |
| POST | `/organizations/:orgId/invitations/:id/resend` | rep (manager/Director invites), admin | New Clerk invitation, resets `created_at`. Reuse the logic behind the admin-only `POST /admin/users/invitations/:invitationId/resend` (`api/src/routes/users.ts`) |
| DELETE | `/organizations/:orgId/invitations/:id` | existing | Revoke |
| PATCH | `/organizations/:orgId` | existing | Reps: `name`, `phone`, `billingEmail` (**C6**). Admins also: `accountLeadUserId` |
| GET/PATCH | `/portal/me/notifications` | any property-side user | `NotificationPrefs` (5.1) plus `weeklyReport: { on: boolean; locked: boolean }` |

```ts
type TeamMember = {
  id: string; name: string | null; email: string; role: "representative" | PropertyRole; you: boolean;
  properties: { id: string; name: string }[] | "all";      // "all" for representatives
  receivesWeeklyReport: boolean;                           // reps: notification_prefs.weekly_rollup
  lastSeenAt: string | null; mfa: "passkey" | "authenticator" | "none";
};
```

Write `audit_log` rows for: property create (existing), member attach/unassign, team edits, removals, invitations (existing), org profile edits (existing), violation status changes (existing helper).

---

## 7. Screen specs

Copy and sample values in the design files are illustrative (names, counts, "7 nights"); the copy below is final unless marked [placeholder]. Every screen has loading skeletons, an error `Alert` with Retry, and the empty states listed.

### 7.0 Shell (all screens)

- Layout, sidebar, top bar and badges per 3.2–4.2.
- Keyboard: skip link to `#main`; sidebar items are links with `aria-current="page"`.
- **Acceptance:** every `/portal/*` page (except login, accept-invite) renders in `RepShell`; a manager never sees "Team and settings"; nav badges equal the list totals.

### 7.1 Representative dashboard — `/portal/organizations/:orgId` (`Rep-Dashboard.dc.html`)

**Purpose:** one place for a Representative to see every property, what needs attention, and to add properties and managers.

**Layout (top → bottom):**
1. Header: eyebrow "{ORG NAME} · WEEK OF {MON D}", title "Good morning|afternoon|evening, {first name}" (America/New_York), sub-line "{n} violations and {m} resident issues are waiting across your properties." (or "Nothing needs you right now." when both are 0). Actions: **Reports** (outlined, chart icon → `/portal/reports?scope=organization&org=`) and **Add property** (primary → modal). Hide Add property and show "{limit} of {limit} properties" text when the limit is reached.
2. KPI row (5 tiles, each a link): Properties "{n} of {limit}" / "{units} units under service" → dashboard properties section; Violations to review → `/portal/violations?org=`; Open resident issues "Oldest {h} hours" → `/portal/issues?org=`; Service nights "{serviced} of {scheduled}" / "Sun–{today} this week" → Reports; CBES first reply "{h}h" / "Average, last 30 days" → Reports.
3. Two columns (main 2fr, aside 1fr; stacks below 1024 px):
   - **Needs your attention** (`AttentionList`): filter pills All / Violations / Issues (`?filter=`), rows oldest first, row action "Review" (violations → detail) or "View" (issues → issue detail). Footer links "All violations →", "All resident issues →". Empty: "You're all caught up."
   - **Your properties**: heading + "{n} of {limit} · Open a property to see its violations, issues, reports and CBES team." + search (client-side filter by name/city). Grid of `PropertyCard`s, then a dashed **Add a property** tile "{left} of {limit} slots left" (hidden at the limit). Card manager row: avatar + name + "Property manager" + **Change**; with no manager: warning "No manager yet" + **Assign manager**. Both open the Assign manager modal (below).
   - Aside: **Weekly report** card (navy): "Next: Monday, {date} at 7 AM ET", last week's sentence from `lastWeek`, buttons **Open reports** and **Last week PDF** (org roll-up PDF). **Violations this week** mini bar chart by night (`violationsByNight`; nights not yet = light bar and "–"), "Most common: …" from `topViolationTypes`. **Invitations waiting** (hidden when none): email, "{role} · {properties} · sent {n} days ago" or "Expired", **Resend**; header link "Manage team". **Your CBES contacts**: avatars, name, title; "Email office@cbenvironments.com".

**Assign manager modal** (`Modal` md): title "Managers for {property}", `ManagerPicker` of org managers/Directors (checked = currently assigned), plus an "Invite someone new" `InviteRows` block. Save → attach/unassign calls (6.7) and invitations; toast "Managers updated." Reps can leave a property with no manager (the card shows the warning).

**States:** zero properties → the properties section shows an `EmptyState` "Add your first property" with the Add property button; KPIs show "—".

**Acceptance:**
- Only representatives of the org (and admins) can open it; others get the existing area-denied screen.
- Add property is available immediately after first sign-in (no approval step).
- Attention list and KPI counts match the Violations and Issues pages for the same org.
- Assigning a manager updates the card without a full reload (invalidate `["rep","dashboard",orgId]`).

### 7.2 Property home — `/portal/properties/:propertyId` (`Rep-ManagerDashboard.dc.html`)

**Purpose:** a manager's home for one property; also what a Representative sees when opening a property.

**Layout:**
1. Hero card: property photo (left, placeholder icon when none) and, right: eyebrow organization name, title property name, "{address} · {units} units · {buildings} buildings". Actions: **Reports** (primary → `/portal/reports?scope=property&property=`), **Last week's PDF**. Reps also get **Edit** (opens the property basics form, existing `EditDetails` restyled) — managers never. Chips: "Service active · {nights label}" (e.g. "Sun–Thu nights", from settings) or "Starting {date}"; "Trash out {window}"; "Spot pressure washing · next in {month year}" only when `pressureWashing` and a date is known.
2. KPI row (5): Violations to review; Resolved, 30 days ("Avg {d} days to resolve"); Open resident issues ("CBES replied in {h}h" when applicable); Service nights this week; Repeat units ("{count}+ violations in {days} days").
3. Main column:
   - **Violations to review** (max 5): thumb, type, "{repeat ordinal} in {days} days" pill when repeat, "{ref} · {where} · logged {when} by {valet first name + last initial}", **Open**, **Mark resolved** (green). Mark resolved opens a small popover with `ResolutionPicker` and Save (same API as 7.6); success toast "Marked resolved." and the row leaves the list. Footer "All violations →". Empty: "No violations to review. Nice work."
   - **Resident issues** (latest 5): title, status badge, "{ref} · {where} · {when}", resident's words in quotes (first 90 chars), **View**. Sub-line: "Reports residents send from the QR code. CBES staff handle them within 24 hours; you can follow along."
   - **Repeat units** with a "Overwatch · Phase 2" pill: cards "{unit}", "{n} in {days} days", types; disabled dashed button "Put on Overwatch · coming soon". Hidden when none.
4. Aside:
   - **Tonight's service** (navy): "Starts {time}" chip (or "No service tonight" on non-service nights/holidays), Steward avatar + name, valets list, footer "Last service night: …" from `lastNight` (hidden if no Connecteam data).
   - **Property team**: members with role and a "Weekly report" pill when they receive it; "(you)" marker; representatives listed last with "Representative · {org}". Header note "Managed by your Representative" for managers; reps instead get a **Manage** link → Assign manager modal.
   - **Resident report link**: QR code (`QrCode`), the URL, **Copy link**, **Download QR poster** (client-side PDF: logo, "Report a trash problem", QR, URL) [poster copy placeholder].

**Admin preview:** `?as=manager` keeps working and hides every write control.

**Acceptance:** a manager of another property gets 404; the page never shows `new`/`in_review` violations; Mark resolved here and on the detail page produce identical events.

### 7.3 Add property — `/portal/organizations/:orgId/properties/new` (`Rep-AddProperty.dc.html`)

Rebuild the rep variant of `AddPropertyModal` (keep the admin variant as is). Modal lg (880 px).

- Header: org tile, "{org} · {n} of {limit} properties", title "Add a property", close.
- **1 Location:** Street address with Google Places lookahead (existing `AddressField` + `places.ts`), City / County / ZIP auto-filled and editable; green check line "Inside the CBES service area ({County} County)." when the county is in the service list (`settings`/brief counties: DeKalb, Gwinnett, Cobb, Fulton incl. South Fulton), otherwise a warning "Outside our usual area. CBES will reach out." (does **not** block). Map preview (Maps Static API, existing key).
- **2 Profile:** photo/logo upload (existing photo-upload flow), Property name (required), Units (required, ≥ 1), Buildings.
- **3 Service:** Service start date (required, default next Sunday) with hint "Valet service begins this night."; Trash-out window select ("6–8 PM, pickup from 8 PM" default, "7–9 PM, pickup from 9 PM"); checkbox "Include yearly spot pressure washing" / "Around trash areas and compactors, once a year." No contract, Connecteam or Steward fields for reps.
- **4 Property managers:** "Pick people already on your team or invite someone new. Managers only see the properties you assign them." `ManagerPicker` (org managers and Directors), then "Invite someone new" `InviteRows` with roles Property manager / Management Director.
- Success note (green): "**What happens next:** the property is live right away. Managers you picked can see it now, new invites go out by email, and CBES is notified so we can assign your Steward and print the resident QR codes."
- Footer: progress bar "This will be property {n+1} of {limit}", **Cancel**, primary "Add property" + " and invite {k} {person|people}" when invites exist.

**Validation:** name, address, units, start date required; slug auto-generated (existing `slug-available`); duplicate invite emails merged; at the limit the API's 409 shows "You've reached {limit} properties. Email office@cbenvironments.com to raise the limit."

**After save:** close the modal, toast "{name} added.", invalidate the dashboard; show per-invite failures from the response in a toast list (existing `InviteResult`).

**Acceptance:** the property appears as Active (or "Starting {date}") immediately; admins get a notification; a manager picked in step 4 can open the property right away; no "awaiting" state exists anywhere.

### 7.4 Team and settings — `/portal/organizations/:orgId/settings` (`Rep-Settings.dc.html`)

**Purpose:** where Representatives invite and manage managers and keep the organization's details.

- Title "Team and settings", sub "Invite property managers, choose which properties they can see, and keep {org}'s details current."
- Tabs (`?tab=`): Team (default, count = people) · Invitations (count = pending) · Organization · Notifications. On ≥ 1280 px the Organization, Notifications and Security cards also show in the right column of the Team tab (as designed); below that they live only in their tabs.

**Team tab, main column:**
1. **Invite a manager** card: Work email (required), Name; Role radio cards — **Property manager** "Mostly view-only. Updates violation status and adds comments. Sees resident issues." and **Management Director** "Same access as a manager, across several properties. Gets the weekly report."; "Properties they can see" `PropertyChips` (at least one required; "{n} selected"); switch "Send them the Monday weekly report" (forced on and disabled for Directors); footer note "Invitations expire after 7 days. You can resend any time." and **Send invitation**. Success toast "Invitation sent to {email}." and the form resets.
2. **Waiting to accept** table: Email, Role, Properties, Status ("Expires in {n} days" warning / "Expired" danger), **Resend**, **Revoke** (confirm dialog). Hidden when empty.
3. **Your team** table with search: Person (avatar, name, email; "(you)"), Role badge, Properties ("All properties" for reps), Weekly report Yes/No, Last active (relative), action: **Profile** for yourself, **Edit access** for managers/Directors (modal: role, `PropertyChips`, weekly report switch, **Remove from {org}** danger link with confirm), none for other Representatives.

**Right column / other tabs:**
- **Organization profile**: logo (Change logo, existing endpoint) "Shown on reports and courtesy notices.", Organization name (editable, existing rule), Main office phone (used on courtesy notices), Billing contact email, **Save changes**.
- **My notifications**: switches for "Violations sent to my properties" (one email per CBES send), "New resident issues", "Updates on issues I follow", "Monday weekly report" (org roll-up for reps), "Invitation accepted".
- **Sign-in and security**: current method (passkey/authenticator from existing MFA data), note "Everyone on your team must use a passkey or authenticator app.", **Manage sign-in methods** (existing security flow).

**Acceptance:** reps can invite managers and Directors but the UI has no Representative option; the API rejects `representative` from reps (403); managers/Directors can't open this route; edits write audit rows.

### 7.5 Violations — `/portal/violations` (`Rep-Violations.dc.html`)

- Title "Violations", sub "Logged by CBES valets and reviewed by CBES before they reach you. Send residents a courtesy notice, then mark it resolved." Actions: **Export CSV**, **Reports** (outlined).
- Tabs: To review (default) · Resolved · All, with counts.
- Filters (`FilterBar`): Property (reps: all org properties; managers with one property: hidden), Type, Dates (default last 30 days), search "Unit, building or V-number", checkbox "Repeat units only".
- Bulk bar (navy) when rows are selected: "{n} selected", **Mark resolved** (opens `ResolutionPicker`, applies to all; only `sent` rows are changed, the toast reports skipped ones), **Download courtesy notices**, **Clear**.
- Table: checkbox, Violation (thumb, type, "{ref} · {n} photos"), Property (hidden when scoped to one property), Where, Logged, "Unit, 30 days" (number; red "{n} · repeat" pill at/over threshold), Status (property labels, 4.3), open chevron. Pagination "Showing 1–10 of {total}…".
- Footnote: "CBES never contacts residents about violations. Courtesy notices always come from your office."
- **Empty:** To review: "No violations to review." Resolved/All: "No violations in this range."
- **Acceptance:** never lists `new`, `in_review` or `dismissed`; filters live in the URL; CSV matches the filters.

### 7.6 Violation detail — `/portal/violations/:id` (`Rep-ViolationDetail.dc.html`)

- Back link "All violations". Eyebrow: ref, status badge, red "{ordinal} for this unit in {days} days" when repeat. Title = type. Sub "{property} · Building {b} · Unit {u} · Logged {day, date} at {time} by {valet name}".
- Header actions: **Courtesy notice (PDF)**; **Mark resolved** (green) when `sent`, **Reopen** (secondary) when `resolved`.
- Main column: `PhotoGallery` with caption "{date} · {time} · {location note}"; **Details** grid (Type, Pickup night, Building and unit, Logged by, Reviewed by, Sent to property); "Valet's note" box; **Notes with CBES**: thread of property-visible events, "CBES and your property team see these notes. Residents never do.", textarea "Add a note for CBES", hint "Your Steward {name} and CBES admins get an email.", **Post note**.
- Aside:
  - **Update status** card (green border): Status select (Sent to property (open) / Resolved), "How did you handle it?" `ResolutionPicker` (shown when Resolved), **Save status**, note "Your property closes violations. Resolved ones stay in reports, and you can reopen them. CBES sees the status and how you handled it."
  - **Timeline** (`Stepper`): Logged by valet → Reviewed by CBES → Sent to property ("waiting on you" while open) → Resolved ("{date} · {name} · {resolution label}").
  - **Unit {u} history** with "Overwatch · Phase 2" pill: this unit's visible violations (type, ref, date, status), footer "{count} violations in {days} days reaches the Overwatch threshold. Alerts for watched units arrive in Phase 2." (only when at/over threshold).
- Valets and Stewards opening this route keep today's behavior (CBES-only notes, no status control).
- **Acceptance:** status changes write one event each and update `resolution`, `resolved_by`, `resolved_at`; reopening clears `resolution`, `resolved_by`, `resolved_at`; `other` requires a note; the PDF never includes valet or CBES names.

### 7.7 Resident issues — `/portal/issues` (`Rep-Issues.dc.html`)

- Title "Resident issues", sub "What residents report from the QR code on their container. CBES staff handle every issue and reply within 24 hours. You can see everything, as it happens." Actions: Property select (reps), **Export CSV**.
- Two panes (list 1fr, detail 2fr; detail replaces the list below 1024 px with a back link):
  - **List** with tabs Open · Resolved · All: title, time, "{ref} · {property} · {where}", status badge, reply-clock pill ("Reply due in {h}h" warning, "Replied in {h}h" neutral). Selected row: `tint-2` background and navy left bar.
  - **Detail**: eyebrow ref + status ("CBES replied · fix scheduled" uses the status label only; no free text), title, "{property} · Building · Unit · {date time}", right pill "First reply in {h}h {m}m" (success) or the live clock. Facts grid: Resident, Email, Phone + "OK to call" (only when given), Assigned at CBES. `IssueThread` of `events`. Footer: view-only note "View only. CBES staff reply to the resident and close the issue once it's fixed." and **Email me updates** / **Following** toggle.
- No composer, no status control, no assign control anywhere for property-side users.
- **Empty:** Open: "No open issues. CBES will show new ones here as residents report them."
- **Acceptance:** API tests prove property users can't change reports and never receive internal comments or call notes; follow toggles `report_followers` and drives the `issue_updates` email.

### 7.8 Reports — `/portal/reports` (`Rep-Reports.dc.html`)

- Title "Reports", sub "The same numbers CBES emails every Monday at 7 AM ET, for your whole organization or one property." Actions: **Email me**, **All properties (ZIP)** (org scope only), **Download PDF** (org roll-up or property PDF).
- Scope bar: segmented Organization / One property (reps only; managers see their property select or nothing), Property select (enabled in property scope), week stepper "Week of {Mon D – Mon D, YYYY}" (previous/next; next disabled for the current week).
- KPI row (6) from `kpis`, with good/bad colored sub-lines (fewer violations = good, more issues = bad).
- **Violations sent, last 8 weeks**: grouped bars Sent (navy) / Resolved by property (`#9396D6`), legend, current week label bold (`GroupedBars`).
- **By type this week** (`HBarList`) + "Resident issues this week" sentence.
- **By property** table (org scope): Property + "PM {name}", Service nights, Violations, Resolved, Resident issues, Avg first reply, Repeat units (red pill when > 0), **PDF**, **Open** (→ property home); totals row.
- **Past Monday reports**: week, "Sent {date} at 7:00 AM to {n} people", **View** (→ `/portal/properties/:id/report?week=` or the org PDF), **PDF**.
- **Who gets the Monday report** (navy card): recipients with scope, "Next send: …", link "Change in Team and settings" (reps only).
- **Acceptance:** numbers equal the admin Weekly Reports view and the emailed report for the same week; service nights use the settings calendar (Sun–Thu default), never 7.

### 7.9 My account — `/portal/account` (no design)

For managers and Directors: page title "My account"; reuse the **My notifications** card (without "Invitation accepted"; "Monday weekly report" switch locked on for Directors) and the **Sign-in and security** card from 7.4; plus a read-only "Your properties" list. Representatives are redirected to their Team and settings `?tab=notifications`.

---

## 8. Notifications and email

All emails from `office@cbenvironments.com` using the existing notification template (title, body, button to the app link). In-app notifications use the existing `notifications` table and bell.

| Event | Who | Respects pref | Email copy (subject) |
| --- | --- | --- | --- |
| 8.1 Property added by a Representative | all admins | — | "{Rep} added {property} to {org}" — body lists what CBES still needs: Steward, Connecteam job, QR codes. Link → admin property detail |
| CBES sends violations (existing `POST /admin/violations/send`) | property's managers + Directors + org reps | `violations_sent` | existing digest, one per send action |
| Property comment on a violation (existing) | the valet's Steward + admins | — | existing |
| Violation resolved or reopened by the property | the Steward (in-app only) | — | "{property}: V-{ref} resolved ({resolution})" |
| New resident issue at my property | property members + org reps | `new_issues` | "New resident issue at {property}: {issue}" |
| Update on a followed issue (CBES reply, resolved) | followers | `issue_updates` | "Update on #{ref} at {property}" |
| Someone I invited accepted | inviting rep | `invite_accepted` | "{name} joined {org}" |
| Monday weekly report | existing recipients | property: `receives_weekly_report`; org roll-up: `weekly_rollup` | existing |

Never email residents about violations.

---

## 9. Build order and milestones

Each milestone ends with `pnpm typecheck && pnpm lint && pnpm test` passing (and the API's tests in cbes-api) and a review before the next.

| # | Milestone | Includes | Done when |
| --- | --- | --- | --- |
| R0 | Shell and rules | `RepShell`, `RepSidebar`, `RepTopbar`, `ContextSwitcher`, `/portal/nav-counts`, `/portal/search`, `/portal/me` extensions, route table 3.1 with placeholders, C7, C8 redirects, C3 (rep invites Directors) | Every portal route renders in the new shell for reps and managers; API test: rep inviting `director` → 201, `representative` → 403 |
| R1 | Representative dashboard + Add property | Migration 0018, dashboard endpoint, `RepDashboardPage`, `PropertyCard`, Assign manager modal, member attach endpoint, rep `AddPropertyModal` variant, C2 admin notification + `property_needs_setup` attention item | e2e: rep signs in first time → adds a property with one existing manager and one invite → property shows Active; admin sees the notification |
| R2 | Violations | `/portal/violations` list/bulk/export, PATCH changes (C4), resolution, courtesy notice PDF, rebuilt detail page | API tests: property users never see `new/in_review/dismissed`; manager, Director and rep can resolve and reopen; `other` requires a note; valet/Steward behavior unchanged |
| R3 | Property home | `PropertyHome` fields, `PropertyHomePage`, tonight's service, repeat units, QR link + poster | Manager sees only their properties; preview `?as=manager` shows no write controls |
| R4 | Resident issues | `/portal/issues*`, follow, `IssueThread`, notifications 8 | API tests: no write endpoints for property users; `comment` events and call bodies never returned |
| R5 | Reports | summary/history/org PDF/email-me, `RepReportsPage`, ZIP | Totals equal admin Weekly Reports for the same week |
| R6 | Team and settings + My account | team endpoints, invitations resend/revoke, org profile fields, notification prefs, `TeamSettingsPage`, `AccountPage` | Edit access/removal works and is audited; prefs change which emails go out |

---

## 10. Testing and acceptance

- **Unit (Vitest):** property-side status label mapping (4.3); scope resolution rules (3.1); resolution validation; service-night math with holidays and a Sun–Thu calendar; notification pref defaults.
- **Component (Testing Library, `src/test/render.tsx`):** each new page with mocked `useApi` for loading, empty, error and populated states; manager vs rep control visibility; filters ↔ URL; modals trap focus and close on Escape.
- **API (cbes-api), table-driven:** for each endpoint in section 6 × {admin, rep of org, rep of other org, Director of property, manager of property, manager of other property, Steward, valet} → expected 200/403/404. Include: rep invites `director` ✓ / `representative` ✗; manager PATCH violation from `sent` ✓, from `new` → 404; issue endpoints read-only; property limit 409.
- **E2E (Playwright, desktop + Pixel 7):** rep first sign-in → dashboard (no approval screen) → add property with manager → invite Director; manager signs in → resolves a violation with "Courtesy notice sent" → reopens it; manager opens an issue and follows it; rep downloads the org PDF.
- **Accessibility:** `@axe-core/playwright` on every `/portal/*` route; zero serious/critical.
- **Performance:** portal sections lazy-loaded like admin; QR and PDF libraries load on click.

---

## 11. Open questions

Defaults below are what this spec builds unless Nick says otherwise.

1. **Can Representatives resolve and reopen violations, or only managers and Directors?** Today's code allows only managers/Directors. Default: **reps can too**, since they see every property and act for the organization.
2. **Can Representatives invite Management Directors?** Today only admins can. Default: **yes** ("only Reps add managers" covers both property-level roles); inviting another Representative stays admin-only.
3. **Property limit:** keep 100 per organization (`property_limit`, admins can raise it)? Default: keep.
4. **Organization name:** reps can rename today (and still can in this spec). The design showed the field locked. Default: editable.
5. **Courtesy notice wording** and **QR poster copy** [placeholder]: Nick to provide final text.
6. **Trash-out windows:** are 6–8 PM and 7–9 PM the only choices? Default: those two, editable later in admin Settings.
7. **Pressure washing:** does checking the box need a CBES quote follow-up (admin notification), or is it included in the agreement? Default: included in the 8.1 admin notification as a line item.

---

## Appendix A. Using this spec with Claude Code

Ready-to-paste prompts for every milestone (R0–R6 plus a final check) are in `docs/REP_PORTAL_PROMPTS.md`.

1. Keep this file, `docs/ADMIN_PORTAL_SPEC.md` and `docs/design/rep/` in the repo.
2. Start each milestone from the repo root with a prompt like:

```
Read docs/REP_PORTAL_SPEC.md sections 0–4, then section 9 milestone R1 and the screens it lists in section 7.
Open the matching design files in docs/design/rep/ (see docs/design/rep/README.md for how to read them).
Reuse the Admin Portal components and patterns already in src/ (useApi, React Query, ui.tsx, DataTable, FilterBar, charts, RequireArea).
List the cbes-api endpoints and migration changes R1 needs from sections 5–6 as a separate checklist for the API repo.
Follow claude.md for any new environment variable. Run pnpm typecheck, lint and test, then stop and summarize.
```

3. Do the matching cbes-api work in `../api` with sections 2.3, 5 and 6.
4. After each milestone, update section 11 with answers and tick the acceptance items in section 7.
