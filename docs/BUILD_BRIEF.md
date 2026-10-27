# CB Environment Solutions — Website, Portal and Admin Build Brief

Version 1.0 · October 27, 2026 · Owner: Nick Crawford (CEO) · Domain: cbenvironments.com

This brief is the single source of truth for building the CBES website and reporting portal. The `design/` folder holds the approved screen designs as static HTML. Match their layout, copy and colors; rebuild them as React components (do not copy the inline styles verbatim).

---

## 1. What we are building

CB Environment Solutions (CBES) is a metro Atlanta valet trash company for apartment communities, founded by brothers Nick and Nigel Crawford. Tagline: **"Aiming for excellence."**

One web app with three areas:

| Area | Path | Who uses it | Purpose |
| --- | --- | --- | --- |
| Public site | `/` | Property managers, residents | Win contracts (quote requests); give residents the rules and a way to report issues |
| Portal | `/portal` | Valets, area leads, property managers | Valets log violations at night on their phones; managers see their property's reports |
| Admin | `/admin` | Nick, Nigel (CBES admins) | All properties, all reports, assign and resolve, settings, weekly report recipients |

Business rules that must hold everywhere:

- Service nights are **Sunday–Thursday from 8:00 PM**.
- CBES **replies to every resident report within 24 hours**. Track time to first reply.
- **Resident reports are fully visible to that property's management.**
- **Violations go only to property management.** CBES never contacts, notifies or fines residents about violations. No resident-facing violation notices of any kind.
- A unit with **3 or more violations in a rolling 30 days** is an **Overwatch** unit. The threshold is an admin setting (default 3 in 30 days).
- Violation photos show trash and doorways, never people. Show this as helper text in the valet app.
- The weekly report goes out **every Monday at 7:00 AM America/New_York**, covering the prior Sunday–Saturday, one email per property to that property's **management Director** (plus any extra recipients), and one roll-up of all properties to CBES admins.
- No recycling service. Bulk pickup is offered.
- Pricing is quote only. Never show prices on the public site.

---

## 2. Tech stack

| Layer | Choice | Notes |
| --- | --- | --- |
| Front end | **Vite + React 18 + TypeScript** | Single app, client-side routing |
| Routing | React Router v6 | Lazy-load `/portal` and `/admin` bundles |
| Styling | Tailwind CSS with the brand tokens in section 4 | Mobile-first |
| Forms | React Hook Form + Zod | Same Zod schemas validate in Edge Functions |
| Data | `@supabase/supabase-js` + TanStack Query | |
| Backend | **Supabase**: Auth, Postgres with Row Level Security, Storage, Edge Functions, pg_cron | No separate API server |
| Email | Resend, sending from `office@cbenvironments.com` | Domain verified on cbenvironments.com |
| SMS (phase 4) | Twilio | Resident report confirmations only, with opt-in |
| Bot protection | Cloudflare Turnstile on public forms | Verified in the Edge Function |
| Valet app | Same app at `/portal/valet`, installable PWA (`vite-plugin-pwa`) with an offline queue in IndexedDB | |
| Hosting | Vercel (SPA rewrites to `index.html`) | Supabase project in us-east-1 |
| Tests | Vitest (unit), Playwright (end-to-end), pgTAP or SQL tests for RLS | |

**Why no custom API:** the browser talks to Supabase directly and Row Level Security enforces who sees what. Server code exists only where it must: public form submissions (anti-spam, emails), and the scheduled weekly report. Those live in `supabase/functions/`.

---

## 3. Repository layout

```
cbes-web/
  src/
    main.tsx, App.tsx, routes.tsx
    lib/ (supabase.ts, auth.tsx, queryClient.ts, schemas.ts, dates.ts)
    components/ (Header, Footer, Button, Card, StatTile, StatusBadge, PhotoUploader, ...)
    site/ (HomePage, ServicesPage, AboutPage, ResidentsPage, QuotePage, FaqPage, ContactPage, PrivacyPage, TermsPage)
    portal/ (Login, ValetHome, ValetLogViolation, ValetCloseNight, ManagerOverview, ManagerReports, ReportDetail)
    admin/ (AdminOverview, AdminReports, AdminViolations, AdminOverwatch, AdminProperties, AdminPropertyDetail, AdminUsers, AdminWeeklyReports, AdminSettings, AdminQuotes)
  public/ (logos, favicon, manifest)
  supabase/
    migrations/ (SQL schema, RLS, views, seed)
    functions/ (submit-resident-report, submit-quote, weekly-report, notify-admin)
    seed.sql
  tests/ (e2e/, rls/)
  .env.example
  README.md
```

---

## 4. Brand

| Token | Value | Use |
| --- | --- | --- |
| `navy` | `#272B84` | Primary: header, hero, buttons, headings |
| `navy-dark` | `#1A1C5E` | Footer, hover |
| `navy-night` | `#12143F` | Valet app background (dark, for night work) |
| `gold` | `#928064` | Logo, accents, large numbers only (fails contrast for small text) |
| `gold-text` | `#7A6A50` | Small gold labels on white (passes AA) |
| `gold-light` | `#C8BBA5` | Gold text on navy |
| `ink` | `#1A1C3D` | Body text |
| `muted` | `#4A4C63` | Secondary text |
| `surface` | `#F8F8F8` | Alternate section background |
| `line` | `#E4E4EC` | Borders |

- Fonts: **Fira Sans** 600/700 for headings, **Open Sans** 400/600/700 for body (Google Fonts).
- Logos in `assets/`: `logo-gold-on-navy.png` (header and footer), `logo-blue-on-white.png` (light backgrounds, emails), `crawford-brothers-archer.png` (About page, favicon source).
- Footer always shows **"Aiming for Excellence · Matt. 6:33"**.
- Buttons: 8 px radius, 44 px minimum height. Cards: 12–16 px radius, 1 px `line` border, no heavy shadows.
- Photos: all photo slots in the designs are labeled placeholders. Build them as a `<Placeholder label="...">` component so real photos drop in later.

---

## 5. Pages and routes

### Public site

| Route | Design file | Notes |
| --- | --- | --- |
| `/` | `design/home.html` | Hero, proof strip, services, "how a service night works" (5 steps), why CBES, weekly report preview, founders, quote CTA with short form, footer |
| `/services` | `design/services.html` | Doorstep valet trash, annual spot pressure washing, add-ons, quote CTA |
| `/about` | `design/about.html` | Founder story, leadership cards (Nick: CEO and Co-Founder; Nigel: Co-Founder and VP of Operations), values, service area |
| `/residents` | `design/residents.html` | Rules, service nights and holidays, bulk pickup, QR explainer, **Report an Issue form** at `#report` |
| `/report` | (same form) | Standalone report form. Accepts `?p=<property_slug>&u=<unit_code>` from QR codes and pre-fills them |
| `/report/:token` | new | Resident's status page for their report (no login; unguessable token) |
| `/quote` | `design/quote.html` | Multi-section quote form |
| `/faq` | new, same styling | Split into Residents and Property Managers (missed pickup, weather and holidays, bag limits, items taken by mistake, contract options 12-month / 36-month / month-to-month, insurance, start-up timeline) |
| `/contact` | new | Phone (470) 585-2776, office@cbenvironments.com, PO Box 645, Clarkston, GA 30021, short form that posts to `submit-quote` with type `contact` |
| `/privacy`, `/terms` | new | Placeholder legal text marked for attorney review |

Header nav: Services, How It Works (`/#how`), About, Residents, Report an Issue, Portal Login, **Get a Quote** button. On mobile: hamburger menu plus a fixed bottom bar with Get a Quote and Report an Issue.

Service area copy: DeKalb, Gwinnett, Cobb, Fulton and South Fulton, and more across metro Atlanta.

### Portal (`/portal`, login required)

| Route | Role | Design |
| --- | --- | --- |
| `/portal/login` | all | Email + password for staff; magic link option |
| `/portal/valet` | valet, lead | Tonight's assigned property, start night, units/buildings |
| `/portal/valet/log` | valet, lead | `design/valet-app.html`: camera-first, big buttons, unit, violation type, optional note, auto time + GPS, works offline |
| `/portal/valet/close` | valet, lead | Close out the night: confirm all buildings serviced, notes (e.g. "compactor full in Bldg 5") |
| `/portal/manager` | manager, director | Their property's overview: open reports, this week's violations, Overwatch units |
| `/portal/manager/reports` | manager, director | Resident reports and violations list with filters, export CSV |
| `/portal/reports/:id` | per RLS | Report detail: photos, timeline, comments visible to the property |

### Admin (`/admin`, admin role only)

| Route | Design |
| --- | --- |
| `/admin` | `design/admin-dashboard.html`: KPIs (open reports, reports this week vs last, average first reply, violations logged, Overwatch units), violations by type, Overwatch list, latest reports table |
| `/admin/reports`, `/admin/violations` | Filter by property, type, status, date, unit; bulk assign; CSV export |
| `/admin/overwatch` | Units over threshold, with history |
| `/admin/properties`, `/admin/properties/:id` | Properties, buildings, units, contacts, weekly report recipients, QR code sheet (phase 4) |
| `/admin/users` | Invite users and set roles and property access |
| `/admin/weekly-reports` | Sent log, preview any week, resend |
| `/admin/quotes` | Quote and contact requests with status (new, contacted, quoted, won, lost) |
| `/admin/settings` | Overwatch threshold, issue and violation type lists, holiday dates |

---

## 6. Users, roles and access

Roles: `admin` (CBES owners/ops), `lead` (area lead), `valet`, `director` (property management Director, receives the weekly report), `manager` (other property staff), plus anonymous residents.

| Data | Resident (anonymous) | Valet / Lead | Manager / Director | Admin |
| --- | --- | --- | --- | --- |
| Submit resident report | Yes (via Edge Function) | — | Yes | Yes |
| See a resident report | Only their own, via token | Lead: assigned properties | Their properties, full detail | All |
| Create violation | No | Assigned properties | No | Yes |
| See violations | **Never** | Own submissions (lead: assigned properties) | Their properties | All |
| Comment / change status | No | Lead: assigned properties | Comment on their properties | All |
| Properties, users, settings | No | Read assigned | Read their property | Full |

Residents never get accounts in phase 1–3. Their report page uses a random token link emailed to them.

---

## 7. Data model (Postgres)

Use `uuid` primary keys (`gen_random_uuid()`), `created_at timestamptz default now()` everywhere, and Postgres enums or check constraints for the value lists.

```sql
profiles (id uuid pk references auth.users, full_name text, phone text, role text check (role in ('admin','lead','valet','director','manager')), active bool default true)

properties (id, name, slug unique, address, city, county, unit_count int, management_company, service_start_date date, contract_type text check (contract_type in ('12_month','36_month','month_to_month')), status text default 'active')
buildings (id, property_id fk, name)
units (id, property_id fk, building_id fk null, unit_code text, unique(property_id, unit_code))

property_members (property_id fk, user_id fk, role text check (role in ('lead','valet','director','manager')), receives_weekly_report bool default false, primary key (property_id, user_id))
report_recipients (id, property_id fk, email text, name text)  -- extra weekly report recipients without accounts

resident_reports (
  id, ref_no serial, property_id fk, unit_id fk null, unit_text text, building_text text,
  reporter_name text, reporter_contact text, contact_method text,
  issue_type text check (issue_type in ('missed_pickup','trash_in_hallway','container_damaged_missing','spill_mess','item_taken','valet_conduct_noise','bulk_pickup_request','other')),
  issue_date date, description text,
  status text default 'new' check (status in ('new','assigned','in_progress','resolved','closed')),
  assigned_to uuid fk profiles null,
  first_response_at timestamptz, resolved_at timestamptz,
  public_token text unique default encode(gen_random_bytes(18),'hex'),
  source text default 'web' check (source in ('web','qr','phone','import'))
)

violations (
  id, ref_no serial, property_id fk, unit_id fk null, unit_text text,
  violation_type text check (violation_type in ('bag_not_tied','outside_container','over_filled','after_8pm','prohibited_item','bulk_item_at_door','container_not_out')),
  note text, logged_by uuid fk profiles, logged_at timestamptz,  -- device time
  lat double precision, lng double precision, gps_accuracy_m real,
  client_id uuid unique  -- generated on the phone; makes offline sync idempotent
)

photos (id, owner_type text check (owner_type in ('resident_report','violation','pressure_wash','service_night')), owner_id uuid, storage_path text, created_at)

report_events (id, report_type text, report_id uuid, actor uuid null, kind text check (kind in ('created','status_change','assigned','comment','reply_sent')), from_status text, to_status text, body text, visible_to_property bool default true, created_at)

service_nights (id, property_id fk, service_date date, opened_by fk, opened_at, closed_by fk, closed_at, buildings_completed int, notes text, unique(property_id, service_date))

pressure_washes (id, property_id fk, building_id fk null, scope text, scheduled_for date, completed_at timestamptz, notes text)

quote_requests (id, kind text check (kind in ('quote','contact')), full_name, title, company, phone, email, community_name, unit_count int, address, property_type text, desired_start date, services text[], current_provider text, notes text, status text default 'new')

weekly_report_runs (id, property_id fk null, week_start date, week_end date, sent_at timestamptz, recipients text[], status text, error text, unique(property_id, week_start))

settings (key text pk, value jsonb)  -- overwatch_threshold {"count":3,"days":30}, holidays [...], admin_notify_emails [...]
```

Views and functions:

- `overwatch_units` view: units with `count(violations) >= threshold.count` where `logged_at >= now() - threshold.days`.
- `report_metrics(property_id, from, to)` function: counts by type and status, average hours to first response and to resolve, nights serviced vs scheduled (Sun–Thu minus holidays).
- Triggers: set `first_response_at` on the first `reply_sent` or `comment` event by a CBES user; set `resolved_at` when status becomes `resolved`; write a `report_events` row on every status change.

Seed data: one demo property ("Demo Community"), 3 buildings, 30 units, one user per role, sample reports and violations so every screen renders.

### Row Level Security

Enable RLS on every table. Helper functions:

```sql
is_admin() returns bool                    -- profiles.role = 'admin'
member_role(p uuid) returns text           -- role in property_members for auth.uid()
can_see_property(p uuid) returns bool      -- is_admin() or member_role(p) is not null
```

Key policies:

- `violations`: insert allowed when `member_role(property_id) in ('valet','lead')` or admin, with `logged_by = auth.uid()`. Select allowed for admin, `director`/`manager`/`lead` of that property, and the valet who logged it. **No anonymous access.**
- `resident_reports`: no direct anonymous insert (inserts go through the `submit-resident-report` Edge Function with the service role). Select for `can_see_property(property_id)`. Update (status, assignment) for admin and lead.
- `report_events`: select when the parent report is visible and (`visible_to_property` or the user is CBES staff).
- `photos`: Storage bucket `photos` is private. Read through signed URLs (1 hour) when the owner record is visible. Upload path `photos/{owner_type}/{owner_id}/{uuid}.jpg`.
- `quote_requests`, `settings`, `weekly_report_runs`, `profiles` writes: admin only.

Write RLS tests (one per role per table) before building screens that rely on them. Nick is a QA engineer and will review these.

---

## 8. Edge Functions

| Function | Trigger | Does |
| --- | --- | --- |
| `submit-resident-report` | POST from public form | Verify Turnstile token; validate with Zod; resolve property by slug and unit by code; insert report and photos (max 3, 10 MB each, images only); email the resident a confirmation with ref number and status link (`/report/:token`); email CBES admins; return `{ref_no, token}` |
| `submit-quote` | POST from quote and contact forms | Verify Turnstile; validate; insert; email office@cbenvironments.com; auto-reply "Nick or Nigel will reach out within 24 hours." |
| `weekly-report` | pg_cron every Monday at 11:00 and 12:00 UTC; runs only when America/New_York local time is 7 AM (handles daylight saving) | For each active property: compute last Sun–Sat metrics; render the email from `design/weekly-report-email.html` (logo, KPIs, resident reports by type, violations by type with up to 4 photo thumbnails, Overwatch units, pressure washing, CBES notes from service night close-outs, "Open the dashboard" button); send to the Director, `receives_weekly_report` members and `report_recipients`; send the all-properties roll-up to admins; record a `weekly_report_runs` row; skip if already sent for that week. Admin can trigger a preview or resend from `/admin/weekly-reports` |
| `notify-admin` | Database webhook on new report older than 20 hours with no first response | Email admins a "24-hour reply due" warning |

A PDF attachment of the weekly report is phase 3b; the email plus dashboard link is enough for phase 3.

---

## 9. Valet app details

- Big touch targets (56 px), dark navy theme, works one-handed.
- Camera opens first (`<input type="file" accept="image/*" capture="environment">`); compress to ~1600 px JPEG on device before upload.
- Unit picker: search units for tonight's property; recent units first.
- Violation types as a 2-column button grid (labels in the design).
- GPS captured automatically with accuracy; if unavailable, still save and mark it.
- **Offline:** save to IndexedDB with a `client_id`, show "Saved, will sync"; retry on reconnect; server dedupes on `client_id`.
- English first; all strings in a translation file so Spanish can be added in phase 4.

---

## 10. Environment variables

`.env.example`:

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_TURNSTILE_SITE_KEY=
VITE_SITE_URL=https://cbenvironments.com
```

Edge Function secrets (Supabase dashboard, never in the front end): `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`, `ADMIN_NOTIFY_EMAILS=office@cbenvironments.com`, `SITE_URL`, later `TWILIO_*`.

---

## 11. Build phases and done criteria

Build in order. Finish each phase, run the checks, and stop for review before starting the next.

### Phase 1 — Public site and forms
- [ ] Vite + React + TS + Tailwind scaffold, brand tokens, fonts, logos, Header/Footer with mobile menu and bottom bar
- [ ] Home, Services, About, Residents, Quote, FAQ, Contact, Privacy, Terms match the designs at 1440, 768 and 390 px
- [ ] Supabase project, migrations for `properties`, `buildings`, `units`, `resident_reports`, `photos`, `quote_requests`, `settings`, seed data
- [ ] `submit-resident-report` and `submit-quote` working end to end with Turnstile and Resend emails
- [ ] `/report?p=&u=` pre-fill and `/report/:token` status page
- [ ] SEO: titles and meta descriptions per page, Open Graph image, `LocalBusiness` JSON-LD, sitemap.xml, robots.txt
- [ ] Lighthouse mobile 90+ for Performance, Accessibility, Best Practices, SEO; axe shows no serious issues
- [ ] Playwright: submit a quote and a resident report on mobile and desktop

### Phase 2 — Portal and admin
- [ ] Auth (email + password, magic link), `profiles`, `property_members`, invites from `/admin/users`
- [ ] All tables, triggers, views and RLS from section 7, with RLS tests passing for every role
- [ ] Valet PWA: log violation with photo + GPS, offline queue, close-out night
- [ ] Manager overview and reports list; report detail with timeline and comments
- [ ] Admin overview (matches `design/admin-dashboard.html`), reports, violations, Overwatch, properties, quotes, settings
- [ ] `notify-admin` 24-hour warning
- [ ] Playwright: valet logs a violation offline then syncs; manager sees it; resident cannot

### Phase 3 — Weekly report
- [ ] `weekly-report` function, email template matching the design, DST-safe schedule, idempotent per week
- [ ] `/admin/weekly-reports` log, preview and resend
- [ ] Test with seed data for two properties; verify recipients and numbers by hand

### Phase 4 — Grow
- [ ] Printable QR code sheet per property (one per unit) linking to `/report?p=&u=`
- [ ] Spanish for the residents page, report form and valet app
- [ ] SMS confirmations (Twilio) with opt-in
- [ ] Bulk pickup booking with scheduling (payments later)
- [ ] Import past violations from the "Violations - Sage Pointe" Google Form (export its response sheet to CSV; map columns to `violations`; mark `source = import`)
- [ ] Weekly report PDF attachment

---

## 12. Content still to come from CBES

- Photos: Nick and Nigel, valets in uniform, branded containers, pressure washing before and after
- Proof strip number for communities served (leave as hidden until set)
- Testimonials and property logos (later, after contracts sign)
- Holiday make-up policy wording, container "bring in by" time (design shows [10 AM])
- Privacy policy and terms from an attorney
- Bag size and weight limits for the FAQ

Do not invent stats, testimonials or prices. Keep placeholders clearly marked.
