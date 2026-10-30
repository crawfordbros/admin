import type { AdminSettings, Day, Holiday, IssueTypeSetting, ViolationTypeSetting } from "../../lib/api";
import type { IconName } from "../../components/icons";

// The Settings screen edits a draft copy and saves only the sections that changed
// (ADMIN_PORTAL_SPEC 7.15). Everything here is pure so it can be tested on its own.

export const DAYS: { value: Day; short: string; long: string }[] = [
  { value: "sun", short: "Sun", long: "Sunday" },
  { value: "mon", short: "Mon", long: "Monday" },
  { value: "tue", short: "Tue", long: "Tuesday" },
  { value: "wed", short: "Wed", long: "Wednesday" },
  { value: "thu", short: "Thu", long: "Thursday" },
  { value: "fri", short: "Fri", long: "Friday" },
  { value: "sat", short: "Sat", long: "Saturday" },
];

/** Rows carry a client id so new ones (no key yet) can be keyed, edited and reordered. */
export type IssueRow = IssueTypeSetting & { id: string };
export type ViolationRow = ViolationTypeSetting & { id: string };
export type Draft = Omit<AdminSettings, "issueTypes" | "violationTypes"> & { issueTypes: IssueRow[]; violationTypes: ViolationRow[] };
export type Section = "overwatch" | "issues" | "violations" | "calendar" | "reports";

export const toDraft = (s: AdminSettings): Draft => ({
  ...s,
  issueTypes: s.issueTypes.map((t) => ({ ...t, id: t.key })),
  violationTypes: s.violationTypes.map((t) => ({ ...t, id: t.key })),
});

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Rows added or edited, plus one when the saved rows were reordered. */
function listChanges<T extends { id: string; key: string }>(base: T[], draft: T[], fields: (keyof T)[]): number {
  const byKey = new Map(base.map((r) => [r.key, r]));
  let n = 0;
  for (const r of draft) {
    const was = r.key ? byKey.get(r.key) : undefined;
    if (!was || fields.some((f) => !same(r[f], was[f]))) n++;
  }
  const order = (rows: T[]) => rows.filter((r) => r.key).map((r) => r.key);
  if (!same(order(base), order(draft))) n++;
  return n;
}

const fieldChanges = <T extends object>(a: T, b: T) => (Object.keys(a) as (keyof T)[]).filter((k) => !same(a[k], b[k])).length;

/** How many unsaved changes each section has. */
export function changes(base: Draft, draft: Draft): Record<Section, number> & { total: number } {
  const holidays = (a: Holiday[], b: Holiday[]) => a.filter((h) => !b.some((x) => x.date === h.date && x.name === h.name)).length;
  const counts = {
    overwatch: fieldChanges(base.overwatch, draft.overwatch),
    issues: listChanges(base.issueTypes, draft.issueTypes, ["label", "labelEs", "replyTargetHours", "onForm"]),
    violations: listChanges(base.violationTypes, draft.violationTypes, ["label", "labelEs", "active", "countsForOverwatch"]),
    calendar: fieldChanges(base.calendar, draft.calendar) + holidays(draft.holidays, base.holidays) + holidays(base.holidays, draft.holidays),
    reports: fieldChanges(base.weeklyReport, draft.weeklyReport) + fieldChanges({ r: base.email.reportsFrom, q: base.email.quotesFrom }, { r: draft.email.reportsFrom, q: draft.email.quotesFrom }),
  };
  return { ...counts, total: Object.values(counts).reduce((a, b) => a + b, 0) };
}

/** Errors that stop a save, keyed by field (rows by `issue:{id}` / `violation:{id}`). */
export function validate(d: Draft): Record<string, string> {
  const errors: Record<string, string> = {};
  const labels = (rows: { id: string; label: string }[], prefix: string, noun: string) => {
    const seen = new Map<string, string>();
    for (const r of rows) {
      const label = r.label.trim();
      if (!label) errors[`${prefix}:${r.id}`] = "Enter a label";
      else if (label.length > 60) errors[`${prefix}:${r.id}`] = "Keep the label under 60 characters";
      else if (seen.has(label.toLowerCase())) errors[`${prefix}:${r.id}`] = `Another ${noun} already has this label`;
      seen.set(label.toLowerCase(), r.id);
    }
  };
  labels(d.issueTypes, "issue", "issue type");
  labels(d.violationTypes, "violation", "violation type");
  if (d.issueTypes.length && !d.issueTypes.some((t) => t.onForm)) errors.issueTypes = "Keep at least one issue type on the form";
  if (d.violationTypes.length && !d.violationTypes.some((t) => t.active)) errors.violationTypes = "Keep at least one violation type active";
  if (!d.calendar.serviceNights.length) errors["calendar.serviceNights"] = "Choose at least one service night";
  const sender = (key: "reportsFrom" | "quotesFrom") => {
    const v = d.email[key].trim().toLowerCase();
    if (!d.email.allowedSenders.map((a) => a.toLowerCase()).includes(v))
      errors[`email.${key}`] = `Email can only be sent from ${list(d.email.allowedSenders)}. Another address needs to be added to the email sending setup first.`;
  };
  sender("reportsFrom");
  sender("quotesFrom");
  return errors;
}

const list = (items: string[]) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} or ${items.at(-1)}`);

const weekday = (date: string) => DAYS[new Date(`${date}T12:00:00Z`).getUTCDay()];

/** "Thu, 2026 · made up Fri", "Fri, 2026 · not a service night", "Mon, 2027 · no make-up". */
export function holidayNote(date: string, calendar: Draft["calendar"]): string {
  const day = weekday(date);
  const year = date.slice(0, 4);
  if (!calendar.serviceNights.includes(day.value)) return `${day.short}, ${year} · not a service night`;
  if (calendar.makeupPolicy === "skip") return `${day.short}, ${year} · no make-up`;
  return `${day.short}, ${year} · made up ${DAYS[(DAYS.indexOf(day) + 1) % 7].short}`;
}

/** Moves a row up (-1) or down (+1); out-of-range moves return the same array. */
export function move<T>(rows: T[], index: number, by: number): T[] {
  const to = index + by;
  if (to < 0 || to >= rows.length) return rows;
  const next = [...rows];
  const [row] = next.splice(index, 1);
  next.splice(to, 0, row);
  return next;
}

export const SECTION_NAV: { id: string; label: string; icon: IconName }[] = [
  { id: "overwatch", label: "Overwatch threshold", icon: "eye" },
  { id: "issues", label: "Issue types", icon: "message" },
  { id: "violations", label: "Violation types", icon: "alert-triangle" },
  { id: "calendar", label: "Nights and holidays", icon: "calendar" },
  { id: "reports", label: "Weekly reports and email", icon: "mail" },
];
