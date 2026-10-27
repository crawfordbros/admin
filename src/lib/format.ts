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
