/**
 * App-wide double-click protection for controls that aren't the shared Button (plain buttons,
 * menu items, list options): the extra clicks of a double-click (`detail` > 1) never reach them.
 * Controls meant for repeated clicks, such as a +/− stepper, opt out with `data-repeatable`.
 * The shared Button and useApi add their own guards on top (see components/ui.tsx, lib/api.ts).
 */
export function installDoubleClickGuard(doc: Document = document): () => void {
  const guard = (e: MouseEvent) => {
    if (e.detail < 2) return;
    const target = e.target instanceof Element ? e.target.closest("button, [role='button'], [role='menuitem'], [role='option'], input[type='submit']") : null;
    if (!target || target.closest("[data-repeatable]")) return;
    e.preventDefault();
    e.stopPropagation();
  };
  doc.addEventListener("click", guard, true);
  return () => doc.removeEventListener("click", guard, true);
}
