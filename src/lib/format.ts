import type { ContractType, InviteRole, PropertyRole, ValetTimes } from "./api";

export const CONTRACT_LABELS: Record<ContractType, string> = {
  "12_month": "12-month",
  "36_month": "36-month",
  month_to_month: "Month-to-month",
};

export const PROPERTY_ROLE_LABELS: Record<PropertyRole, string> = {
  manager: "Property manager",
  director: "Management Director",
};

export const INVITE_ROLE_LABELS: Record<InviteRole, string> = {
  representative: "Representative",
  ...PROPERTY_ROLE_LABELS,
};

export const VALET_STATUS_TEXT: Record<Exclude<ValetTimes["status"], "ok">, string> = {
  not_configured: "Valet clock-in times will appear once Connecteam is connected.",
  no_job: "Valet clock-in times will appear once CBES links this property to its Connecteam job.",
  error: "Valet clock-in times couldn't be loaded from Connecteam right now. Try again later.",
};

export const autoClockOutNote = (n: number) =>
  `${n} automatic clock-out${n === 1 ? "" : "s"} (a valet forgot to clock out) left out of the clock-out times.`;

export const lastOut = (n: { lastClockOut: string | null; stillClockedIn: boolean }) =>
  n.stillClockedIn ? "Still clocked in" : (n.lastClockOut ?? "Automatic clock-out");

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Tue, Oct 20" for a YYYY-MM-DD date. */
export function formatDay(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  return `${DAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** "Oct 20, 2026" for an ISO timestamp, in New York time. */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric" });
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

export const hours = (h: number | null) => (h === null ? "—" : `${h} h`);

/** "just now", "12 min ago", "3 h ago", "2 d ago", then the date. */
export function timeAgo(iso: string, now = Date.now()): string {
  const min = Math.round((now - Date.parse(iso)) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  if (min < 24 * 60) return `${Math.round(min / 60)} h ago`;
  if (min < 7 * 24 * 60) return `${Math.round(min / (24 * 60))} d ago`;
  return formatDate(iso);
}

/** "Good morning" before noon, "Good afternoon" before 5 PM, then "Good evening", in New York time. */
export function greeting(now = new Date()): string {
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23" }).format(now));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

/** "Tuesday, October 27" in New York time. */
export const longDay = (now = new Date()) =>
  now.toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric" });

export const ORG_STATUS_LABELS = { onboarding: "Onboarding", active: "Active", inactive: "Inactive" } as const;

export const PROPERTY_TYPE_LABELS = { garden: "Garden", mid_rise: "Mid-rise", high_rise: "High-rise" } as const;

const count = new Intl.NumberFormat("en-US");
/** "1,752" */
export const formatCount = (n: number) => count.format(n);

/** "4.9h", or "—" when there's nothing to average. */
export const replyHours = (h: number | null) => (h === null ? "—" : `${h.toFixed(1)}h`);

/** "Mar 2026" for a YYYY-MM-DD date. */
export function monthYear(date: string): string {
  const d = new Date(`${date.slice(0, 10)}T12:00:00Z`);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "21 hours" / "3 days" for how long something has waited. */
export function age(hours: number): string {
  if (hours < 1) return "under an hour";
  if (hours < 48) return `${Math.round(hours)} hour${Math.round(hours) === 1 ? "" : "s"}`;
  return `${Math.round(hours / 24)} days`;
}

/** "Tonight 8:47 PM", "Mon 9:58 PM" this week, otherwise "Oct 19, 8:20 PM" — New York time. */
export function serviceTime(iso: string, now = new Date()): string {
  const tz = "America/New_York";
  const day = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: tz });
  const time = new Date(iso).toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
  const d = new Date(iso);
  const days = Math.round((Date.parse(`${day(now)}T12:00:00Z`) - Date.parse(`${day(d)}T12:00:00Z`)) / 86_400_000);
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(d));
  if (days === 0) return `${hour >= 17 ? "Tonight" : "Today"} ${time}`;
  if (days > 0 && days < 7) return `${d.toLocaleDateString("en-US", { timeZone: tz, weekday: "short" })} ${time}`;
  return `${d.toLocaleDateString("en-US", { timeZone: tz, month: "short", day: "numeric" })}, ${time}`;
}

/** "Oct 27, 2026, 8:47 PM" in New York time. */
export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

/** Today and the start of ranges, as YYYY-MM-DD in New York. */
export function nyToday(now = new Date()) {
  return now.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}
