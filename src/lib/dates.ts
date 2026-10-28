import { addDays, nyToday } from "./format";

export const DATE_PRESETS = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "month", label: "This month" },
];

/** A date filter value (a preset, or [from, to]) as the API's from/to, in New York days. Empty means any time. */
export function dateRange(value: string[], today = nyToday()): { from?: string; to?: string } {
  if (value.length === 2) return { from: value[0], to: value[1] };
  const days = { today: 1, "7d": 7, "30d": 30, "90d": 90 }[value[0] as "today"];
  if (days) return { from: addDays(today, 1 - days), to: today };
  if (value[0] === "month") return { from: `${today.slice(0, 8)}01`, to: today };
  return {};
}
