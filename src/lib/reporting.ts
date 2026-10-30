import type { ReportSchedule } from "./api";
import { addDays } from "./format";

export function validReportWeek(week: string): boolean {
  const date = new Date(`${week}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(week) && Number.isFinite(date.getTime()) && date.toISOString().startsWith(week) && date.getUTCDay() === 0;
}

export function reportWeekLabel(week: string): string {
  if (!validReportWeek(week)) return `Invalid report week: ${week}`;
  const label = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
  return `${label(week)} – ${label(addDays(week, 6))}`;
}

export function reportScheduleText(schedule?: ReportSchedule): string {
  if (!schedule) return "on the configured weekly schedule";
  const days = { sun: "Sunday", mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday" };
  const [h, m] = schedule.time.split(":").map(Number);
  return `every ${days[schedule.day]} at ${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"} Eastern`;
}
