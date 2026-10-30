# Steward app design files

Exported from the Claude Design canvas "CBES Website Design" (page "Steward App"), October 29, 2026.
Live canvas: https://claude.ai/artifact/JxU3ogQQZjDDjHNKxZyXSk (private to Nick until shared). The spec is `docs/STEWARD_APP_SPEC.md`; section 3 maps each file to its route.

Phone screens are 390 × 844; `Steward-Tablet.dc.html` is 1194 × 834. `StewardTabBar.dc.html` is the shared tab bar (props `role`: `valet` | `steward`, `active`).

These are design references, not production code. They use the same Design Component format as `docs/design/admin/README.md` (markup in `<x-dc>`, `{{holes}}` filled from `renderVals()`, `<sc-for>` loops, `<sc-if>` conditions, `<dc-import>` for shared pieces). Sample data is illustrative only. Logos point to `../../assets/`.
