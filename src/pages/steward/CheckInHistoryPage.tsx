import { errorMessage } from "../../lib/api";
import { byWeek, useCheckInHistory } from "../../lib/steward/crew-board";
import { useStewardPreferences } from "../../lib/steward/preferences";
import { clockTime, dayLabel } from "../../lib/steward/shifts";
import { Notice } from "../../components/steward/forms";
import { EmptyState, OutlineButton, Panel, ScreenHeader } from "../../components/steward/ui";
import { useScreenTitle } from "./useScreenTitle";

/** Profile > Check-in history (STEWARD_APP_SPEC section 4, Profile): each shift, with times, hours and flags. */
export function CheckInHistoryPage() {
  const { t, locale } = useStewardPreferences();
  const history = useCheckInHistory();
  useScreenTitle(t("history.title"));
  const items = history.data?.pages.flatMap((p) => p.items) ?? [];
  const number = new Intl.NumberFormat(locale === "es" ? "es-US" : "en-US", { maximumFractionDigits: 1 });
  const shortDay = (date: string) =>
    new Intl.DateTimeFormat(locale === "es" ? "es-US" : "en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));

  return (
    <>
      <ScreenHeader back={{ to: "/steward/me", label: t("history.back") }} title={t("history.title")} />
      <div className="flex flex-col gap-3 pt-1 pb-4">
        {history.isPending && <p role="status" className="m-0 text-st-text-2">{t("app.loading")}</p>}
        {history.error && <Notice>{errorMessage(history.error)}</Notice>}
        {history.isSuccess && items.length === 0 && <EmptyState icon="tonight" title={t("history.emptyTitle")} body={t("history.emptyBody")} />}
        {byWeek(items).map((w) => (
          <Panel key={w.start} className="px-4 py-3" aria-labelledby={`week-${w.start}`}>
            <div className="flex items-baseline justify-between gap-3">
              <h2 id={`week-${w.start}`} className="m-0 text-[15px] font-bold">
                {t("history.week", { date: shortDay(w.start) })}
              </h2>
              <span className="text-[12.5px] text-st-text-2">{t("history.weekTotal", { shifts: w.items.length, hours: number.format(w.hours) })}</span>
            </div>
            <ul className="mt-2 mb-0 list-none p-0">
              {w.items.map((c) => {
                const flags = [!c.insideGeofence && t("crew.flag.outside"), c.autoCheckedOut && t("crew.flag.auto"), c.lateSync && t("crew.flag.lateSync")].filter(Boolean) as string[];
                return (
                  <li key={c.id} className="flex items-start justify-between gap-3 border-t border-st-track py-2.5">
                    <span className="min-w-0">
                      <strong className="block text-[14.5px]">{dayLabel(c.serviceDate, locale)}</strong>
                      <span className="block text-[13px] text-st-text-2">
                        {c.propertyName} · {t("history.in", { time: clockTime(c.checkedInAt, locale) })}
                        {c.checkedOutAt ? ` · ${t("history.out", { time: clockTime(c.checkedOutAt, locale) })}` : ""}
                      </span>
                      {flags.map((f) => (
                        <span key={f} className="mt-1 mr-1.5 inline-block rounded-full bg-st-warn-bg px-2 py-0.5 text-[11.5px] font-bold text-st-warn">
                          {f}
                        </span>
                      ))}
                    </span>
                    <span className="flex-none text-[14px] font-bold">
                      {c.hours == null ? <span className="text-st-ok">{t("history.onShift")}</span> : t("history.hours", { h: number.format(c.hours) })}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Panel>
        ))}
        {history.hasNextPage && (
          <OutlineButton disabled={history.isFetchingNextPage} onClick={() => void history.fetchNextPage()}>
            {history.isFetchingNextPage ? t("app.loading") : t("history.more")}
          </OutlineButton>
        )}
      </div>
    </>
  );
}
