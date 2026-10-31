import type { ReplyClock } from "./api";

export type ClockView = { text: string; tone: "success" | "warning" | "danger" | "neutral" };

const h = (n: number) => `${Math.round(n)}h`;

/**
 * The reply promise as a chip (ADMIN_PORTAL_SPEC 4.5): green while under half the target is used,
 * amber from half, red from five-sixths (12 and 20 hours of a 24-hour target) and once it's
 * overdue; gray after a reply. Each issue type sets its own target in Settings.
 */
export function clockView(clock: ReplyClock): ClockView {
  if (clock.state === "replied") return { text: `Replied in ${clock.hours < 1 ? "under 1h" : h(clock.hours)}`, tone: "neutral" };
  if (clock.state === "none") return { text: "No reply logged", tone: "neutral" };
  const used = clock.targetHours - clock.hoursLeft;
  const text = clock.hoursLeft < 0 ? `Overdue ${h(-clock.hoursLeft)}` : clock.hoursLeft < 1 ? "Under 1h left" : `${h(clock.hoursLeft)} left`;
  return { text, tone: used >= (clock.targetHours * 5) / 6 || clock.hoursLeft < 0 ? "danger" : used >= clock.targetHours / 2 ? "warning" : "success" };
}
