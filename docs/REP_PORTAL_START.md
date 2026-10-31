# Rep Portal — start prompt for Claude Code

Open Claude Code in the `crawfordbros` folder (it holds both `admin` and `api`) and paste the prompt below.

```
We're building the CBES Rep Portal: the property side of /portal for Representatives, Property managers and Management Directors.

Design: https://claude.ai/artifact/JxU3ogQQZjDDjHNKxZyXSk (Claude Design canvas, "Rep Portal" page). It's private, so use the exported copies in admin/docs/design/rep/ — admin/docs/design/rep/README.md maps each file to its route and explains the format.

Read these first:
1. admin/docs/REP_PORTAL_SPEC.md — the full spec. Section 0 holds the owner's decisions and overrides anything older; section 2.3 lists every change to existing code; section 9 is the build order (R0–R6).
2. admin/docs/REP_PORTAL_PROMPTS.md — the exact instructions for each milestone, plus a final check.
3. admin/docs/ADMIN_PORTAL_SPEC.md — the companion spec for shared roles, components and data model. Where the two disagree about property-side users, REP_PORTAL_SPEC.md wins.

Then work through the milestones in REP_PORTAL_PROMPTS.md in order, starting with R0. For each milestone:
- Do the API work in api/ and the app work in admin/, reusing the existing Admin Portal components and patterns.
- Follow claude.md for any new environment variable, and never read or print secrets.
- Run pnpm typecheck, lint and test in both admin and api.
- Stop and summarize what changed, what's left, and anything that conflicts with the spec or design. Wait for my go-ahead before starting the next milestone. Don't commit or push unless I ask.

If something in the spec is unclear or is listed as an open question in section 11, build the default the spec states and call it out in your summary.
```
