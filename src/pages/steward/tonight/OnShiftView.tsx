import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { ApiError, errorMessage } from "../../../lib/api";
import { useOutbox } from "../../../lib/steward/outbox";
import { useStewardPreferences } from "../../../lib/steward/preferences";
import { clockTime, span, useBuildingProgress, useCheckOut, usePosition, wallTime, type Shift, type Tonight } from "../../../lib/steward/shifts";
import { Notice } from "../../../components/steward/forms";
import { Icon } from "../../../components/steward/icons";
import { Panel } from "../../../components/steward/ui";
import { cx } from "../../../components/styles";
import { useNow } from "./useNow";

/**
 * Screen 6, Tonight while checked in (docs/design/steward/Steward-Home): the check-in with Check out,
 * your route with a Finish button per building and the door count, and tiles for violations, issues and
 * the next shift.
 */
export function OnShiftView({ tonight, onShift }: { tonight: Tonight; onShift: NonNullable<Tonight["onShift"]> }) {
  const { t, locale } = useStewardPreferences();
  const now = useNow();
  const shift = tonight.shifts.find((s) => s.property.id === onShift.propertyId);
  const next = tonight.shifts.find((s) => s.property.id !== onShift.propertyId && !s.checkIn && Date.parse(s.startsAt) > now);
  const on = span(Date.parse(onShift.checkedInAt), now);
  const duration = on.h ? t("duration.hm", on) : t("duration.m", on);

  return (
    <div className="flex flex-col gap-3">
      <CheckedInCard onShift={onShift} shift={shift} duration={duration} />
      {shift && <RouteCard shift={shift} />}
      <Link to={`/steward/properties/${onShift.propertyId}`} className="flex min-h-[52px] items-center gap-3 rounded-2xl bg-st-surface px-4 text-[14.5px] font-semibold text-st-text no-underline hover:text-st-text">
        <Icon name="property" size={20} className="text-st-text-3" />
        <span className="flex-1">{t("tonight.propertyLink")}</span>
        <Icon name="chevron" size={18} strokeWidth={2.2} className="text-st-text-3" />
      </Link>
      {tonight.counts.openIssues > 0 && (
        <Link to="/steward/issues" className="flex items-center gap-3 rounded-2xl border-l-4 border-st-info bg-st-surface px-4 py-3.5 text-st-text no-underline hover:text-st-text">
          <span className="flex-1">
            <strong className="block text-[15px]">{t("tiles.issues")}</strong>
          </span>
          <span className="font-heading text-[22px] font-bold">{tonight.counts.openIssues}</span>
          <Icon name="chevron" size={18} strokeWidth={2.2} className="text-st-text-3" />
        </Link>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Link to="/steward/violations" className="rounded-2xl bg-st-surface p-3.5 text-st-text no-underline hover:text-st-text">
          <span className="block text-[12.5px] font-semibold text-st-text-2">{t("tiles.violations")}</span>
          <span className="block font-heading text-[26px] font-bold">{tonight.counts.violationsTonight}</span>
        </Link>
        <div className="rounded-2xl bg-st-surface p-3.5">
          <span className="block text-[12.5px] font-semibold text-st-text-2">{t("tiles.nextShift")}</span>
          {next ? (
            <>
              <span className="mt-1 block text-[15px] font-bold">{next.property.name}</span>
              <span className="block text-xs text-st-text-2">{wallTime(next.startTime, locale)}</span>
            </>
          ) : (
            <span className="mt-1 block text-[15px] font-bold">{t("tiles.none")}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function CheckedInCard({ onShift, shift, duration }: { onShift: NonNullable<Tonight["onShift"]>; shift: Shift | undefined; duration: string }) {
  const { t, locale } = useStewardPreferences();
  const checkOut = useCheckOut();
  const { locate } = usePosition();
  const [confirming, setConfirming] = useState(false);
  const [failure, setFailure] = useState("");
  const [queued, setQueued] = useState(false);
  const outbox = useOutbox();
  const { userId } = useAuth();

  async function confirm() {
    setFailure("");
    const fix = await locate();
    const at = new Date().toISOString();
    try {
      await checkOut.mutateAsync({ id: onShift.id, ...fix, at });
    } catch (err) {
      // No signal: the check-out keeps its time on the phone and is sent once back online.
      if (err instanceof ApiError && err.status === 0 && outbox.available && userId) {
        await outbox.enqueue({ kind: "check-out", id: crypto.randomUUID(), userId, createdAt: at, checkInId: onShift.id, data: { ...fix, at }, summary: { propertyName: onShift.propertyName }, attempts: 0 });
        setQueued(true);
        setConfirming(false);
        return;
      }
      setFailure(errorMessage(err));
    }
  }

  return (
    <Panel className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className={cx("flex size-11 flex-none items-center justify-center rounded-xl", onShift.insideGeofence ? "bg-st-ok-bg text-st-ok" : "bg-st-warn-bg text-st-warn")}>
          <Icon name="check" size={22} strokeWidth={2.4} />
        </span>
        <span className="min-w-0 flex-1">
          <strong className="block text-[15px]">{t("shift.checkedIn", { time: clockTime(onShift.checkedInAt, locale) })}</strong>
          <span className="block text-[13px] text-st-text-2">
            {t("shift.onShift", { duration })}
            {shift?.steward && ` · ${t("tonight.shiftSteward", { name: shift.steward.name })}`}
          </span>
        </span>
        {!confirming && (
          <button type="button" onClick={() => setConfirming(true)} className="min-h-11 flex-none rounded-xl border border-st-border px-3.5 text-sm font-bold">
            {t("shift.checkOut")}
          </button>
        )}
      </div>
      {!onShift.insideGeofence && <p className="m-0 text-[13px] font-semibold text-st-warn">{t("shift.flagged")}</p>}
      {onShift.lateSync && <p className="m-0 text-[13px] text-st-text-3">{t("shift.lateSync")}</p>}
      {confirming && (
        <div className="flex flex-col gap-2 rounded-xl bg-st-raised p-3">
          <p className="m-0 text-sm font-bold">{t("shift.checkOutConfirm", { property: onShift.propertyName })}</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => void confirm()} disabled={checkOut.isPending} className="min-h-12 rounded-xl bg-st-cta text-sm font-bold text-st-on-cta">
              {checkOut.isPending ? t("shift.checkingOut") : t("shift.checkOutYes")}
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="min-h-12 rounded-xl border border-st-border text-sm font-bold">
              {t("checkin.cancel")}
            </button>
          </div>
        </div>
      )}
      {failure && <Notice>{failure}</Notice>}
      {queued && <Notice tone="warn">{t("shift.checkOutQueued")}</Notice>}
    </Panel>
  );
}

function RouteCard({ shift }: { shift: Shift }) {
  const { t, locale } = useStewardPreferences();
  const progress = useBuildingProgress();
  const [failure, setFailure] = useState("");
  const percent = shift.doors.total ? Math.round((shift.doors.done / shift.doors.total) * 100) : 0;

  const toggle = (building: string, done: boolean) => {
    setFailure("");
    progress.mutate({ propertyId: shift.property.id, building, done }, { onError: (err) => setFailure(errorMessage(err)) });
  };

  return (
    <Panel>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="m-0 text-[15px] font-bold">{t("route.title")}</h2>
        <span className="text-[13px] text-st-text-2">{t("route.doors", { done: shift.doors.done, total: shift.doors.total })}</span>
      </div>
      <div
        role="progressbar"
        aria-label={t("route.title")}
        aria-valuemin={0}
        aria-valuemax={shift.doors.total}
        aria-valuenow={shift.doors.done}
        className="mt-2 h-2 overflow-hidden rounded-full bg-st-track"
      >
        <span className="block h-full rounded-full bg-st-ok transition-[width] duration-300" style={{ width: `${percent}%` }} />
      </div>
      <ul className="mt-3 mb-0 flex list-none flex-col gap-2 p-0">
        {shift.route.map((b) => {
          const done = Boolean(b.completedAt);
          const busy = progress.isPending && progress.variables?.building === b.name;
          return (
            <li key={b.name} className="flex min-h-[52px] items-center gap-3 rounded-xl bg-st-raised px-2.5 py-2">
              <span aria-hidden="true" className={cx("flex size-[34px] flex-none items-center justify-center rounded-[10px] text-sm font-bold", done ? "bg-st-ok-bg text-st-ok" : "bg-st-cta text-st-on-cta")}>
                {b.name.length <= 3 ? b.name : b.name.slice(0, 2)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold">{t("tonight.building", { name: b.name })}</span>
                <span className="block text-[12.5px] text-st-text-2">
                  {done
                    ? t("route.doneAt", { units: b.units, time: clockTime(b.completedAt!, locale) })
                    : b.doorsDone
                      ? t("route.partial", { done: b.doorsDone, units: b.units })
                      : t("route.units", { units: b.units })}
                </span>
              </span>
              <button
                type="button"
                onClick={() => toggle(b.name, !done)}
                disabled={busy}
                aria-label={done ? t("route.reopenLabel", { name: b.name }) : t("route.finishLabel", { name: b.name })}
                className={cx("min-h-11 flex-none rounded-[10px] px-3 text-[13px] font-bold", done ? "text-st-ok" : "bg-st-cta text-st-on-cta")}
              >
                {done ? (
                  <span className="flex items-center gap-1">
                    <Icon name="check" size={14} strokeWidth={2.6} />
                    {t("route.done")}
                  </span>
                ) : (
                  t("route.finish")
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {failure && (
        <div className="mt-2">
          <Notice>{failure}</Notice>
        </div>
      )}
    </Panel>
  );
}
