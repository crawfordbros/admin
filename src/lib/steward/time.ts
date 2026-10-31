import type { Locale } from "./strings";

// Shifts run on America/New_York time (STEWARD_APP_SPEC section 5, check_ins.service_date), wherever the
// phone's clock is set.

export const SERVICE_TIME_ZONE = "America/New_York";

export function serviceHour(now: Date = new Date()): number {
  const hour = new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: SERVICE_TIME_ZONE }).format(now);
  return Number(hour) % 24;
}

export type DayPart = "morning" | "afternoon" | "evening";

export function dayPart(hour: number): DayPart {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  return "evening";
}

/** "Wednesday, Oct 28" / "miércoles, 28 oct", for the line above a screen's title. */
export function serviceDateLabel(locale: Locale, now: Date = new Date()): string {
  return new Intl.DateTimeFormat(locale === "es" ? "es-US" : "en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: SERVICE_TIME_ZONE,
  }).format(now);
}
