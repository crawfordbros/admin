import type { ReplyClock } from "./api";

export type ClockView = { text: string; tone: "success" | "warning" | "danger" | "neutral" };

const h = (n: number) => `${Math.round(n)}h`;

/**
 * The 24-hour reply promise as a chip (ADMIN_PORTAL_SPEC 4.5): green while under 12 hours of the
 * target are used, amber from 12, red from 20 and once it's overdue; gray after a reply.
 */
export function clockView(clock: ReplyClock): ClockView {
  if (clock.state === "replied") return { text: `Replied in ${clock.hours < 1 ? "under 1h" : h(clock.hours)}`, tone: "neutral" };
  if (clock.state === "none") return { text: "No reply logged", tone: "neutral" };
  const used = clock.targetHours - clock.hoursLeft;
  const text = clock.hoursLeft < 0 ? `Overdue ${h(-clock.hoursLeft)}` : clock.hoursLeft < 1 ? "Under 1h left" : `${h(clock.hoursLeft)} left`;
  return { text, tone: used >= 20 || clock.hoursLeft < 0 ? "danger" : used >= 12 ? "warning" : "success" };
}
