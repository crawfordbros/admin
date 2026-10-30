# Steward — CBES Crew App: Brief Spec

Version 1.0 · October 29, 2026 · Owner: Nick Crawford

- **Live design canvas:** <https://claude.ai/artifact/JxU3ogQQZjDDjHNKxZyXSk> (page "Steward App"; private until shared)
- **Exported design files:** `docs/design/steward/` (one `Steward-*.dc.html` per screen)
- **Companion specs:** `docs/ADMIN_PORTAL_SPEC.md`, `docs/REP_PORTAL_SPEC.md`

## 1. What it is

**Steward** is the employee-facing app for CBES valets and Stewards. It's a mobile-first website (phone first, tablet supported, installable to the home screen) where crew members:

- sign in and create a profile with a **required photo and first/last name**
- see the properties and buildings they're assigned to
- **check in** at the property when a shift starts
- **log violations** with photos, even offline
- work **resident issues** CBES assigns to them

Stewards also run their crew: they see who has checked in, review violations before they go to the property, assign issues and reply to residents.

It lives in the existing admin app (`cbes-admin`) under `/steward`, behind the existing `valet` area (`super_admin`, `admin`, `lead`, `valet`). It uses the same Clerk invite-only sign-in and required passkey or authenticator app. Admins can open it to preview.

## 2. Users and permissions

| Action | Valet | Steward (`lead`) | Admin |
| --- | --- | --- | --- |
| Create own profile (photo, first and last name required) | ✓ | ✓ | ✓ |
| See assigned properties, buildings, access notes | own | own + their crew's | all |
| Check in and out at a property | ✓ | ✓ | — |
| Log violations | ✓ | ✓ | ✓ |
| See own violations and notes on them | ✓ | ✓ | ✓ |
| Review crew violations: Hold for CBES (`in_review`), Send to property (`sent`) | — | their properties | ✓ |
| Dismiss a violation | — | — | ✓ |
| Work assigned issues: On my way (`in_progress`), Fixed with after photo (`resolved`), note | ✓ | ✓ | ✓ |
| Assign an issue to a crew member | — | their properties | ✓ |
| Reply to the resident | — | their properties | ✓ |
| See resident contact details | — | name only | ✓ |
| Assign valets to properties and buildings | — | their properties (default, see 9) | ✓ |
| Invite valets or Stewards | — | — | ✓ (existing `/admin/staff-invitations`) |

## 3. Screens

Phone artboards are 390 × 844; the tablet artboard is 1194 × 834. All screens use the dark navy crew theme: 56 px touch targets and one-handed layouts.

| # | Screen | Route | Design file | Who |
| --- | --- | --- | --- | --- |
| 1 | Sign in | `/steward/login` | `Steward-SignIn` | all |
| 2 | Create profile (step 1 of 3) | `/steward/setup/profile` | `Steward-ProfileSetup` | new users |
| 3 | Contact and sign-in (step 2) | `/steward/setup/security` | `Steward-SetupSecurity` | new users |
| 4 | Waiting for property (step 3) | `/steward/setup/done` | `Steward-Waiting` | new users with no assignment |
| 5 | Check in | `/steward` (before check-in) | `Steward-CheckIn` | all |
| 6 | Tonight | `/steward` (checked in) | `Steward-Home` | all |
| 7 | Property details | `/steward/properties/:id` | `Steward-Property` | all |
| 8 | Crew | `/steward/crew` | `Steward-Crew` | Steward |
| 9 | Log a violation | `/steward/violations/new` | `Steward-LogViolation` | all |
| 10 | My violations | `/steward/violations` | `Steward-Violations` | all |
| 11 | Review | `/steward/review` | `Steward-Review` | Steward |
| 12 | Issues | `/steward/issues` | `Steward-Issues` | all |
| 13 | Issue detail | `/steward/issues/:id` | `Steward-IssueDetail` | all |
| 14 | Profile | `/steward/me` | `Steward-Profile` | all |
| 15 | Tablet command view | `/steward` at ≥ 1024 px, Steward role | `Steward-Tablet` | Steward |
| — | Tab bar | shell | `StewardTabBar` (props `role`, `active`) | all |

**Navigation.**

- Valet tabs: Tonight · Violations · Issues · Property · Me.
- Steward tabs: Tonight · Crew · Review · Issues · Me.
- At 768 px and wider, the tab bar becomes a left rail. Stewards on a 1024 px+ tablet get the three-column command view: Crew, Review, and Issue reply.

The old `Valet.dc.html` artboard on the Website page is replaced by `Steward-LogViolation`.

## 4. Key behavior

**Onboarding (invite-only).**

- An admin invites the person as Valet or Steward.
- The invite link opens step 1. Photo, first name and last name are required before anything else works; the API rejects app calls until `onboarded_at` is set.
- Photo is taken with the front camera or uploaded, cropped square, re-encoded to WebP and stored in R2. Show photo rules: face visible, no hat or sunglasses, good light.
- Step 2 collects a mobile phone, SMS opt-in (with STOP/rates text), app language (English/Español), and a passkey or authenticator app (existing MFA flow).
- With no property assignment yet, step 3 shows "Waiting for your property" with training items: crew guide, violation types with photo examples, and a practice log that sends nothing.

**Check-in.**

- Tonight lists the person's shifts: each assigned property that has service tonight (settings service nights minus holidays, default Sun–Thu), with start time and buildings.
- **Check in** captures GPS and accuracy. It's inside the geofence when the distance from the property pin is ≤ `geofence_radius_m` (default 150 m) plus accuracy.
- Outside the geofence, the person can still check in with a reason. It's flagged to the Steward.
- **Check out** ends the shift. Shifts left open get an automatic check-out at 4 AM, flagged.
- Location is captured only at check-in, check-out and violation logging. There is no background tracking.

**Route progress.**

- Each person sees their assigned buildings and taps **Finish** when a building is done.
- Tonight's door count = sum of done buildings' units plus partial progress (optional floor marks).
- Feeds the admin Overview "Tonight's service" and the property home.

**Log a violation.**

- Camera opens first; 1–4 photos ("the trash and doorway, never people"), compressed on device to about 1600 px JPEG.
- Then building (assigned first), unit (numeric keypad, with recent units), type (2-column grid from `violation_types`) and an optional note. Time and GPS are added automatically.
- A repeat-unit hint appears when the unit is at the Overwatch threshold.
- Offline: saved to IndexedDB with a `client_id`, shown as "Waiting to sync", retried on reconnect. The server dedupes (existing `POST /valet/violations`).
- After saving, the violation is `new` and goes to the Steward's Review queue.

**Review (Stewards).**

- Cards show the photo, type, unit, valet, time, GPS quality, repeat count and note.
- Actions: **Send to property** (`sent`, triggers the existing property digest), **Hold for CBES** (`in_review`, for an admin), **Note** to the valet (CBES-only).
- **Send all** sends every card in the queue.
- Only admins dismiss.

**Issues.**

- Resident reports assigned to the person (`resident_reports.assigned_to`) show with the 24-hour reply clock.
- Valets: **On my way** (`in_progress`), **Fixed · add photo** (an after photo is required; sets `resolved` and notifies the Steward), and a note for the Steward and CBES. Valets never see resident contact details.
- Stewards also assign issues to crew and **reply to the resident** (sent from office@; the property sees the reply). They can reply and resolve in one action.

**Profile.**

- Shows the photo (can be changed, but not removed), name, role, start date and Steward.
- Week stats: shifts, hours from check-ins, violations, issues fixed.
- Lists assigned properties, plus check-in history, phone, language, texts on/off, sign-in methods, crew guide and sign out.

## 5. Data changes (cbes-api, migration `0019_steward_app.sql`)

```sql
ALTER TABLE users ADD COLUMN first_name TEXT;
ALTER TABLE users ADD COLUMN last_name TEXT;
ALTER TABLE users ADD COLUMN avatar_key TEXT;           -- R2 key; required for lead/valet before use
ALTER TABLE users ADD COLUMN phone TEXT;
ALTER TABLE users ADD COLUMN sms_opt_in INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN locale TEXT NOT NULL DEFAULT 'en' CHECK (locale IN ('en','es'));
ALTER TABLE users ADD COLUMN onboarded_at TEXT;

ALTER TABLE properties ADD COLUMN geofence_radius_m INTEGER NOT NULL DEFAULT 150;
ALTER TABLE properties ADD COLUMN access_notes TEXT;     -- gate code etc.; staff only, shown on tap, audited
ALTER TABLE properties ADD COLUMN compactor_note TEXT;

CREATE TABLE staff_buildings (                          -- who covers which buildings
  property_id TEXT NOT NULL REFERENCES properties(id),
  user_id TEXT NOT NULL, building TEXT NOT NULL,
  PRIMARY KEY (property_id, user_id, building)
);
CREATE TABLE check_ins (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, property_id TEXT NOT NULL REFERENCES properties(id),
  service_date TEXT NOT NULL,                           -- America/New_York date of the shift
  checked_in_at TEXT NOT NULL, lat REAL, lng REAL, accuracy_m REAL, distance_m REAL,
  inside_geofence INTEGER NOT NULL, reason TEXT,
  checked_out_at TEXT, auto_checked_out INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX check_ins_property_date ON check_ins(property_id, service_date);
CREATE TABLE building_progress (
  property_id TEXT NOT NULL, service_date TEXT NOT NULL, building TEXT NOT NULL,
  user_id TEXT NOT NULL, completed_at TEXT, doors_done INTEGER,
  PRIMARY KEY (property_id, service_date, building)
);
CREATE TABLE training_progress (
  user_id TEXT NOT NULL, item TEXT NOT NULL, completed_at TEXT NOT NULL, PRIMARY KEY (user_id, item)
);
```

Existing tables reused:

- `property_staff`: property assignment, `lead` or `valet`.
- `properties.steward_user_id`, `violations` and `violation_events`.
- `resident_reports` (`assigned_to`) and `report_events`.
- `photos` for issue after-photos, linked to the report.

## 6. API (under `/api/valet/*`, existing router)

| Method | Path | Who | Purpose |
| --- | --- | --- | --- |
| GET / PATCH | `/valet/me` | crew | Profile, onboarding state, assignments, week stats; update name, phone, SMS, locale |
| POST | `/valet/me/avatar` | crew | Multipart photo → R2; required before `onboarded_at` |
| GET | `/valet/tonight` | crew | Shifts tonight, check-in state, buildings, assigned issues, counts |
| POST | `/valet/check-ins` | crew | `{ propertyId, lat, lng, accuracyM, reason? }` → geofence result |
| POST | `/valet/check-ins/:id/checkout` | crew | End the shift |
| PUT | `/valet/progress/:propertyId/:building` | crew | `{ done: boolean, doorsDone? }` for tonight |
| GET | `/valet/properties/:id` | crew | Details, buildings with assignees, crew tonight; `access_notes` only via `POST /valet/properties/:id/access-notes/reveal` (audited) |
| GET | `/valet/violation-types` | crew | Existing |
| POST | `/valet/violations` | crew | Existing (multipart, `client_id` dedupe) |
| GET | `/valet/violations?range=tonight\|week\|all` | crew | Own violations with status and notes addressed to them |
| GET | `/valet/units/history?propertyId=&unit=` | crew | Count in the Overwatch window, for the repeat hint |
| GET | `/valet/review` | Steward | `new` violations at their properties |
| POST | `/valet/review/:id` | Steward | `{ action: "send" \| "hold", note? }`; `send` reuses the admin send digest |
| POST | `/valet/review/send-all` | Steward | Sends every listed card |
| GET | `/valet/issues?tab=todo\|done` | crew | Assigned issues (Stewards: all at their properties) |
| GET | `/valet/issues/:id` | crew | Detail; resident contact removed for valets, name only for Stewards |
| PATCH | `/valet/issues/:id` | crew | `{ status: "in_progress" \| "resolved", afterPhotoId? }` (resolved requires a photo) |
| POST | `/valet/issues/:id/notes` | crew | Comment event (CBES-only) |
| POST | `/valet/issues/:id/assign` | Steward | `{ userId }` within their crew |
| POST | `/valet/issues/:id/replies` | Steward | Email the resident from office@ (same as the admin reply); optional `resolve: true` |
| GET | `/valet/crew` | Steward | Per property: crew, check-in state, late flags, building progress |
| PUT | `/valet/crew/:propertyId/buildings` | Steward | Building assignments for their properties |
| POST | `/valet/training/:item` | crew | Mark a training item done |

Every call from a lead or valet without `onboarded_at` returns 403 `onboarding_required`, except `/valet/me` and `/valet/me/avatar`.

## 7. Notifications

- **SMS** (if opted in): new issue assigned, shift starts in 30 min with no check-in, a note on your violation, Steward reply needed (Stewards: crew member late 10 min after start).
- **In-app:** the existing `notifications` table.
- **Email:** only for account and security events.
- SMS needs a provider (for example Twilio). Its keys are new environment variables and follow `claude.md`: names in `.env.example` and `.env.local`, values left for the owner, never committed.

## 8. Quality bar

- Mobile-first; works at 360 px; tablet layout at ≥ 768 px; installable PWA (manifest + service worker for the app shell and the violation queue only).
- Touch targets ≥ 56 px for primary actions; dark navy theme with WCAG AA contrast; visible focus.
- English and Spanish: every string goes in a translation file; violation and issue types use `label_es`.
- Offline: violation logging and viewing tonight's assignments work without signal; check-in queues with its original timestamp and is marked "late sync".
- Tests:
  - API permission tests for every endpoint × {admin, Steward of property, Steward of other property, valet assigned, valet not assigned, property manager}.
  - Playwright on Pixel 7 and iPad.
  - axe clean.

## 9. Build order and open questions

**Milestones:**

- **S0:** shell, tab bar or rail, routes, i18n.
- **S1:** onboarding (profile with required photo and name, contact, MFA, waiting), migration 0019.
- **S2:** Tonight, check-in and out, geofence, building progress, property details.
- **S3:** log violation (offline queue), my violations, Steward review.
- **S4:** issues for valets and Stewards (fixed with photo, assign, reply).
- **S5:** crew view, tablet command view, SMS, profile stats.

**Open questions** (defaults in bold):

1. Does Steward check-in **replace Connecteam** for hours? Default: **keep Connecteam for payroll for now**; weekly reports use Steward check-ins when a property has no Connecteam job.
2. Can Stewards assign valets to properties? Default: **yes, for their own properties**; admins assign Stewards.
3. Geofence radius: **150 m** default, editable per property by admins.
4. Do valets reply to residents? Default: **no**, Stewards and admins only.
5. Photo rules: does CBES want a selfie match at check-in? Default: **no**, the profile photo only.
6. SMS provider and budget (Twilio suggested).
