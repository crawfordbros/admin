# Rep Portal design files

Exported from the Claude Design canvas "CBES Website Design" (page "Rep Portal"), October 28, 2026. The full spec is `docs/REP_PORTAL_SPEC.md`; section 1.1 maps each file to its route.

These are design references, not production code. Rebuild them as React components with the repo's Tailwind tokens and the components already built for the Admin Portal (`src/components/`).

| File | Screen | Route |
| --- | --- | --- |
| `Rep-Dashboard.dc.html` | Representative dashboard | `/portal/organizations/:orgId` |
| `Rep-ManagerDashboard.dc.html` | Property home (managers; reps opening a property) | `/portal/properties/:propertyId` |
| `Rep-AddProperty.dc.html` | Add property modal (rep version) | `/portal/organizations/:orgId/properties/new` |
| `Rep-Settings.dc.html` | Team and settings (invite managers) | `/portal/organizations/:orgId/settings` |
| `Rep-Violations.dc.html` | Violations list | `/portal/violations` |
| `Rep-ViolationDetail.dc.html` | Violation detail | `/portal/violations/:violationId` |
| `Rep-Issues.dc.html` | Resident issues (list + detail, view-only) | `/portal/issues`, `/portal/issues/:reportId` |
| `Rep-Reports.dc.html` | Reports | `/portal/reports` |
| `RepSidebar.dc.html` | Sidebar (prop `role`: `rep` or `manager`) | shell |
| `RepTopbar.dc.html` | Top bar (prop `role`) | shell |

There is intentionally no "pending approval" screen: CBES creating the organization and inviting the Representative is the approval (spec section 0).

## How to read a file

Same format as `docs/design/admin/README.md`:

- **Markup** sits between `<x-dc>` and `</x-dc>`. Inline `style="…"` values are the exact sizes, colors, radii and spacing to match.
- **`{{name}}`** is filled from `renderVals()` in the `<script type="text/x-dc">` block at the bottom. That block also holds the sample data. Sample data is illustrative only (names, counts, service nights).
- **`<sc-for list="{{rows}}" as="r">`** repeats per item; **`<sc-if value="{{flag}}">`** shows its contents when true.
- **`<dc-import name="RepSidebar" role="rep" active="violations">`** places another file with those props.
- **`<helmet>`** holds the font link (Fira Sans and Open Sans; already bundled with `@fontsource`).
- Links like `href="Rep-Violations.dc.html"` show where a control goes; use the route from the spec.
- Logos point to `../../assets/` in this repo.

These files need the design runtime to render. Open the canvas in Claude to see them, or ask Nick for screenshots.
