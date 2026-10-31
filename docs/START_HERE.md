# Start here: building the CBES website with Claude

This folder has everything Claude needs to build the CB Environment Solutions website, portal and admin.

| File or folder | What it is |
| --- | --- |
| `BUILD_BRIEF.md` | The full build spec: stack, pages, roles, database, security rules, weekly report, phases and checklists |
| `design/` | The 8 approved screens as HTML (open them in a browser to see them): home, services, about, residents, quote, admin-dashboard, valet-app, weekly-report-email |
| `assets/` | Logos: gold on navy, blue on white, Crawford Brothers archer |

## Before you start (one time, about 30 minutes)

1. **GitHub:** create an empty private repo, for example `cbes-web`.
2. **Supabase:** create a free project at supabase.com (region: East US). Keep the project URL, anon key and service role key handy.
3. **Resend:** create an account at resend.com and verify the domain `cbenvironments.com` (add the DNS records it gives you).
4. **Cloudflare Turnstile:** create a free site key and secret key for `cbenvironments.com` (spam protection for the public forms).
5. **Vercel:** sign in with GitHub. You'll connect the repo after phase 1.

## How to hand it to Claude

1. Clone the empty repo on your computer and copy this whole `Website Build` folder into it as `docs/`.
2. Open Claude Code in that repo folder (or start a Claude Cowork task with the folder connected).
3. Paste the prompt below.
4. Review at the end of each phase before saying "continue to phase 2", and so on.

## Prompt to paste

```
You are building the CB Environment Solutions website, resident/valet/manager portal and admin dashboard.

Read docs/BUILD_BRIEF.md completely first, then open every file in docs/design/ to see the approved screens. The brief is the source of truth; the design files are the visual reference for layout, copy and colors. Rebuild them as clean React components with Tailwind using the brand tokens in the brief. Use the logos in docs/assets/.

Stack: Vite + React 18 + TypeScript + React Router + Tailwind, Supabase (Auth, Postgres with Row Level Security, Storage, Edge Functions, pg_cron), Resend for email. No separate API server.

Work in the phases in section 11 of the brief. Start with Phase 1 only:
1. Propose your plan and file structure, then scaffold the project.
2. Build the public pages to match the designs at desktop and mobile widths.
3. Write the Supabase migrations and seed data Phase 1 needs, and the submit-resident-report and submit-quote Edge Functions.
4. Add a .env.example and a README with setup and deploy steps.
5. Run the Phase 1 checklist (build, lint, Playwright tests, Lighthouse) and report results.

Rules: never invent stats, prices or testimonials; keep photo placeholders labeled; residents must never see or receive anything about violations; keep secrets out of the front end; commit after each completed checklist item. Stop at the end of Phase 1 and summarize what is done, what I need to set up (keys, DNS), and any open questions.
```

## After Phase 1

- Connect the repo to Vercel, add the `VITE_` environment variables, and point `cbenvironments.com` at Vercel.
- Then tell Claude: "Continue with Phase 2 from docs/BUILD_BRIEF.md."
