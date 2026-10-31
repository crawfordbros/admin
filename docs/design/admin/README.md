# Admin Portal design files

Exported from the Claude Design canvas "CBES Website Design" (page "Admin Portal"), October 28, 2026. The full spec is `docs/ADMIN_PORTAL_SPEC.md`; section 1.1 maps each file to its route.

These are design references, not production code. Rebuild them as React components with the repo's Tailwind tokens and `src/components/ui.tsx`.

## How to read a file

Each `.dc.html` file is one screen written in the Design Component format:

- **Markup** sits between `<x-dc>` and `</x-dc>`. Inline `style="…"` values are the exact sizes, colors, radii and spacing to match.
- **`{{name}}`** is a value filled in from the `renderVals()` function in the `<script type="text/x-dc">` block at the bottom of the file. That block also holds the sample data (rows, KPIs, chart values) the screen was drawn with. Sample data is illustrative only.
- **`<sc-for list="{{rows}}" as="r">…</sc-for>`** repeats its contents once per item, with `{{r.field}}` available inside.
- **`<sc-if value="{{flag}}">…</sc-if>`** shows its contents only when the value is true.
- **`<dc-import name="AdminSidebar" active="reports">`** places another file (`AdminSidebar.dc.html`) with those props. Every admin screen uses `AdminSidebar` and `AdminTopbar`.
- **`<helmet>`** holds the font link (Fira Sans and Open Sans; the repo already bundles both with `@fontsource`).
- Links like `href="Admin-Violations.dc.html"` show which screen a control navigates to; use the route from the spec instead.
- Logos point to `../../assets/` in this repo.

These files don't open as finished pages in a plain browser (they need the design runtime). To see them rendered, open the canvas in Claude, or ask Nick for screenshots.
