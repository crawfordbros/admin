import type { Translate } from "./preferences";
import type { Locale } from "./strings";
import type { CrewMember } from "./crew-board";
import { buildingList, clockTime, wallTime } from "./shifts";

// Words and colours for the Steward's crew view (docs/design/steward/Steward-Crew and Steward-Tablet),
// shared by the Crew screen and the tablet command view.

const TONE = {
  ok: "bg-st-ok-bg text-st-ok",
  bad: "bg-st-bad-bg text-st-bad",
  warn: "bg-st-warn-bg text-st-warn",
  quiet: "bg-st-raised text-st-text-2",
} as const;
const DOT = { ok: "bg-st-ok", bad: "bg-st-bad", warn: "bg-st-warn", quiet: "bg-st-text-3" } as const;

export type Tone = keyof typeof TONE;

export const toneClass = (tone: Tone) => TONE[tone];
export const dotClass = (tone: Tone) => DOT[tone];

/** "Bldgs 1–2", "Bldg 3" or "All buildings". */
export function buildingsLabel(names: string[], t: Translate) {
  if (names.length === 0) return t("tonight.allBuildings");
  return names.length === 1 ? t("tonight.bldg", { name: names[0] }) : t("tonight.bldgs", { list: buildingList(names) });
}

/** The line under a person's name: when they came in and their doors, or why they haven't. */
export function statusLine(m: CrewMember, startTime: string, t: Translate, locale: Locale) {
  const doors = t("crew.doors", { done: m.doors.done, total: m.doors.total });
  switch (m.state) {
    case "in":
      return `${t("crew.status.in", { time: clockTime(m.checkIn!.checkedInAt, locale) })} · ${doors}`;
    case "out":
      return `${t("crew.status.out", { time: clockTime(m.checkIn!.checkedOutAt!, locale) })} · ${doors}`;
    case "elsewhere":
      return t("crew.status.elsewhere", { property: m.elsewhere!.propertyName });
    case "later":
      return t("crew.status.later", { time: wallTime(startTime, locale) });
    case "off":
      return t("crew.status.off");
    default:
      return t("crew.status.notIn");
  }
}

/** Check-in details the Steward should know about: outside the area, synced late, checked out at 4 AM. */
export function checkInFlags(m: CrewMember, t: Translate) {
  if (!m.checkIn) return [];
  return [
    !m.checkIn.insideGeofence && (m.checkIn.reason ? `${t("crew.flag.outside")}: ${m.checkIn.reason}` : t("crew.flag.outside")),
    m.checkIn.lateSync && t("crew.flag.lateSync"),
    m.checkIn.autoCheckedOut && t("crew.flag.auto"),
  ].filter((x): x is string => Boolean(x));
}
