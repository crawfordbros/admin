# Rep Portal — Claude Code prompts

Copy one prompt at a time into Claude Code, in order. Each prompt is one milestone from `docs/REP_PORTAL_SPEC.md` section 9. Run it, review the result, commit, then move to the next one.

**Where to run them:** open Claude Code in the `crawfordbros` folder, which holds both `admin` and `api`. Each prompt does the API work first, then the admin app.

**Designs:** every prompt points Claude Code at the exported design files in `admin/docs/design/rep/` (one per screen, with a README that maps each file to its route). The live canvas is https://claude.ai/artifact/JxU3ogQQZjDDjHNKxZyXSk — open the "Rep Portal" page. It's private to you, so Claude Code can't open it; if you change a screen there, ask me to re-export it to `docs/design/rep/`.

**Before you start:** answer or accept the defaults in spec section 11 (open questions). The prompts build the defaults.

---

## R0 — Shell and access rules

```
Read admin/docs/REP_PORTAL_SPEC.md sections 0–4 and the R0 row of section 9.
Also read admin/docs/ADMIN_PORTAL_SPEC.md sections 2 and 4 for the shared roles and components.
Open admin/docs/design/rep/README.md, then RepSidebar.dc.html and RepTopbar.dc.html.

Build milestone R0:
1. API (api/): add GET /portal/nav-counts and GET /portal/search (spec 6.1), extend GET /portal/me (6.1), and apply change C3 (Representatives may invite Property managers and Management Directors, not Representatives) in api/src/routes/organizations.ts, including the invite loop in POST /:id/properties. Add table-driven tests: rep invites director → 201, rep invites representative → 403.
2. Admin app (admin/): build RepShell, RepSidebar, RepTopbar and ContextSwitcher (spec 3.2, 3.3, 4.2, 4.4) and use RepShell for every /portal/* route except login and accept-invite (change C7). Add the route table from spec 3.1 with placeholder pages for screens not built yet. Apply change C8 (redirect ?tab=people and ?tab=invitations to the settings route). Update the role select in AddPropertyModal and the invite modal in OrganizationView for C3.
Reuse the existing Admin Portal components; do not fork them.
Follow claude.md for any new environment variable.
Run pnpm typecheck, lint and test in both admin and api, then stop and summarize what changed and anything you couldn't do.
```

---

## R1 — Representative dashboard and Add property

```
Read admin/docs/REP_PORTAL_SPEC.md sections 0–2, 5.1, 6.2, 6.7, 7.1, 7.3 and 8 (row 8.1), and the R1 row of section 9.
Open admin/docs/design/rep/Rep-Dashboard.dc.html and Rep-AddProperty.dc.html.

Build milestone R1:
1. API: add migration api/migrations/0018_rep_portal.sql exactly as spec 5.1. Add GET /portal/organizations/:orgId/dashboard (6.2), POST /organizations/:orgId/properties/:propertyId/members (6.7), and the new body fields on POST /organizations/:orgId/properties (managerUserIds, trashOutWindow, pressureWashing, created_by). Apply change C2: when a Representative adds a property, notify all admins (8.1) and add the property_needs_setup attention item to the admin Overview. There is no approval or "awaiting setup" state anywhere.
2. Admin app: build RepDashboardPage at /portal/organizations/:orgId with the header, KPI row, Needs your attention list, property cards, Assign manager modal and aside cards from spec 7.1. Build the Representative variant of the Add property modal from spec 7.3 (keep the admin variant unchanged).
Add component tests for loading, empty, error and populated states, and API permission tests for every new endpoint.
Run pnpm typecheck, lint and test in both admin and api, then stop and summarize.
```

---

## R2 — Violations

```
Read admin/docs/REP_PORTAL_SPEC.md sections 0–2 (especially change C4), 4.3, 6.4, 7.5 and 7.6, and the R2 row of section 9.
Open admin/docs/design/rep/Rep-Violations.dc.html and Rep-ViolationDetail.dc.html.

Build milestone R2:
1. API: add GET /portal/violations, GET /portal/violations/export.csv and POST /portal/violations/bulk (6.4). Change PATCH /portal/violations/:id in api/src/routes/violations.ts for C4: Property managers, Management Directors and Representatives can move sent → resolved (resolution required; "other" requires a note) and resolved → sent (reopen, clears resolution, resolved_by and resolved_at). Each change writes one property-visible status event. Add resolution, resolvedBy, sentBy and sentAt to the violation detail.
2. Admin app: build RepViolationsPage (spec 7.5) with tabs, filters in the URL, bulk resolve and CSV export. Rebuild PortalViolationPage (spec 7.6) with the Update status card, ResolutionPicker, timeline, unit history and a client-side courtesy notice PDF (jsPDF, same loader as src/lib/report-pdf.ts). Keep today's behavior for valets and Stewards on this page.
API tests must prove property-side users never see new, in_review or dismissed violations, and that valet and Steward access is unchanged.
Run pnpm typecheck, lint and test in both admin and api, then stop and summarize.
```

---

## R3 — Property home

```
Read admin/docs/REP_PORTAL_SPEC.md sections 0–2, 5.2, 6.3 and 7.2, and the R3 row of section 9.
Open admin/docs/design/rep/Rep-ManagerDashboard.dc.html.

Build milestone R3:
1. API: extend GET /portal/properties/:id with the PropertyHome fields in spec 6.3 (keep the existing fields). Service nights come from settings (default Sun–Thu) minus holidays — never assume 7 nights. Tonight's service reuses the Connecteam cache.
2. Admin app: rebuild PropertyPage as PropertyHomePage (spec 7.2): hero, KPI row, violations to review with inline Mark resolved, resident issues, repeat units (Overwatch Phase 2, disabled button), Tonight's service, Property team, and the resident report link with a QR code (qrcode package, lazy-loaded) and a downloadable QR poster PDF. Representatives get Edit and Manage; managers and Directors never do. The admin ?as=manager preview must hide every write control.
Run pnpm typecheck, lint and test in both admin and api, then stop and summarize.
```

---

## R4 — Resident issues (view-only)

```
Read admin/docs/REP_PORTAL_SPEC.md sections 0–2 (especially change C5), 4.3, 5.1, 6.5, 7.7 and 8, and the R4 row of section 9.
Open admin/docs/design/rep/Rep-Issues.dc.html.

Build milestone R4:
1. API: add GET /portal/issues, GET /portal/issues/:id, GET /portal/issues/:id/photos/:photoId, POST and DELETE /portal/issues/:id/follow, and GET /portal/issues/export.csv (spec 6.5). Property-side users get no endpoint that changes a resident issue. Never return report_events of kind comment, never return call notes, and keep /admin/reports/* returning 403 to them. Send the new-issue and followed-issue emails from section 8, respecting notification_prefs.
2. Admin app: build RepIssuesPage (spec 7.7) with the list and detail panes, the IssueThread component, the view-only note and the Email me updates toggle. No reply box, status control or assign control anywhere.
API tests must cover every property-side role trying each admin report write endpoint and getting refused.
Run pnpm typecheck, lint and test in both admin and api, then stop and summarize.
```

---

## R5 — Reports

```
Read admin/docs/REP_PORTAL_SPEC.md sections 0–2, 5.2, 6.6 and 7.8, and the R5 row of section 9.
Open admin/docs/design/rep/Rep-Reports.dc.html.

Build milestone R5:
1. API: add GET /portal/reports/summary, GET /portal/reports/history, GET /portal/reports/organization/:orgId/pdf (Representatives only) and POST /portal/reports/email-me (spec 6.6). Reuse the numbers the admin Weekly Reports view already computes so both always agree.
2. Admin app: build RepReportsPage (spec 7.8): scope bar (Organization or One property, Representatives only), week stepper, KPI row, 8-week grouped bars, by-type list, by-property table with totals, past Monday reports and recipients. Property PDFs stay client-side; the all-properties ZIP uses fflate, lazy-loaded.
Add a test that the summary totals equal the admin Weekly Reports numbers for the same week.
Run pnpm typecheck, lint and test in both admin and api, then stop and summarize.
```

---

## R6 — Team and settings, My account

```
Read admin/docs/REP_PORTAL_SPEC.md sections 0–2 (especially C3 and C6), 5.1, 6.7, 7.4, 7.9 and 8, and the R6 row of section 9.
Open admin/docs/design/rep/Rep-Settings.dc.html.

Build milestone R6:
1. API: add GET /organizations/:orgId/team, PATCH and DELETE /organizations/:orgId/team/:userId, POST /organizations/:orgId/invitations/:id/resend (reuse the admin resend logic in api/src/routes/users.ts), receivesWeeklyReport on invitations, phone and billingEmail on PATCH /organizations/:orgId (C6, plus accountLeadUserId for admins), and GET/PATCH /portal/me/notifications (spec 5.1, 6.7). Write audit_log rows for every team change. Representatives can never be edited or removed by another Representative.
2. Admin app: build TeamSettingsPage (spec 7.4) with the invite form (Property manager or Management Director only), Waiting to accept, Your team with Edit access, Organization profile, My notifications and Sign-in and security. Build AccountPage at /portal/account for managers and Directors (spec 7.9); the weekly report switch is locked on for Directors.
Run pnpm typecheck, lint and test in both admin and api, then stop and summarize.
```

---

## Final check (after R6)

```
Read admin/docs/REP_PORTAL_SPEC.md section 10.
Run the full checks in admin and api: pnpm typecheck, lint, test, and the Playwright e2e and axe accessibility suites.
Add any missing e2e flow from section 10 (Representative first sign-in → add property with a manager → invite a Director; manager resolves then reopens a violation; manager follows an issue; Representative downloads the organization PDF).
Fix what fails, then list each acceptance item from section 7 as done or not done with a one-line reason.
```
