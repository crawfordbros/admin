import type { Translate } from "../../lib/steward/preferences";
import { STATE_PILL, percent, type CrewMember } from "../../lib/steward/crew-board";
import { toneClass } from "../../lib/steward/crew-display";
import { cx } from "../styles";

// Pieces of the Steward's crew view (docs/design/steward/Steward-Crew and Steward-Tablet), shared by the
// Crew screen and the tablet command view.

/** In, Late, Not in yet…: where the person is tonight. */
export function StatePill({ member, t, className }: { member: CrewMember; t: Translate; className?: string }) {
  const pill = STATE_PILL[member.state];
  return <span className={cx("flex-none rounded-full px-2.5 py-1 text-xs font-bold", toneClass(pill.tone), className)}>{t(pill.key)}</span>;
}

/** A doors progress bar. The numbers are in the text beside it, so the bar itself is hidden from screen readers. */
export function DoorsBar({ doors, className }: { doors: { done: number; total: number }; className?: string }) {
  return (
    <span aria-hidden="true" className={cx("block h-1.5 overflow-hidden rounded-full bg-st-track", className)}>
      <span className="block h-full rounded-full bg-st-go" style={{ width: `${percent(doors)}%` }} />
    </span>
  );
}
