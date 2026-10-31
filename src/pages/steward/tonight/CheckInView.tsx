import { useEffect, useId, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { ApiError, errorMessage } from "../../../lib/api";
import { useOutbox } from "../../../lib/steward/outbox";
import { useStewardPreferences } from "../../../lib/steward/preferences";
import { buildingList, clockTime, insideArea, metersLabel, span, useCheckIn, usePosition, wallTime, type Shift } from "../../../lib/steward/shifts";
import { Notice } from "../../../components/steward/forms";
import { Icon } from "../../../components/steward/icons";
import { BottomAction, CtaButton, OutlineButton } from "../../../components/steward/ui";
import { cx } from "../../../components/styles";
import { CheckInMap } from "./CheckInMap";
import { useNow } from "./useNow";

/**
 * Screen 5, Check in (docs/design/steward/Steward-CheckIn): pick tonight's shift, see whether you're inside
 * its check-in area, and check in. The phone's location is read on this screen and again when you tap
 * Check in, never in the background. Outside the area (or with location off) you check in with a reason.
 */
export function CheckInView({ shifts }: { shifts: Shift[] }) {
  const { t, locale } = useStewardPreferences();
  const now = useNow();
  const [selected, setSelected] = useState(() => (shifts.find((s) => !s.checkIn?.checkedOutAt) ?? shifts[0]).property.id);
  const shift = shifts.find((s) => s.property.id === selected) ?? shifts[0];
  const { position, locate } = usePosition();
  const checkIn = useCheckIn();
  const outbox = useOutbox();
  const { userId } = useAuth();
  const [queued, setQueued] = useState(false);
  const [asking, setAsking] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string>();
  const [failure, setFailure] = useState("");
  const reasonId = useId();

  useEffect(() => {
    void locate();
  }, [locate]);

  const area = position.status === "ok" ? insideArea(shift.property, position) : null;
  const noPin = shift.property.lat == null || shift.property.lng == null;

  async function submit(withReason: boolean) {
    setFailure("");
    if (withReason && !reason.trim()) {
      setReasonError(t("checkin.reasonNeeded"));
      return;
    }
    const fix = await locate();
    const at = new Date().toISOString();
    const clientId = crypto.randomUUID();
    const input = { propertyId: shift.property.id, ...fix, ...(withReason ? { reason: reason.trim() } : {}) };
    try {
      await checkIn.mutateAsync({ ...input, at, clientId });
    } catch (err) {
      // No signal: keep it on the phone with its time; it's sent (and marked late sync) once back online.
      if (err instanceof ApiError && err.status === 0 && outbox.available && userId) {
        await outbox.enqueue({ kind: "check-in", id: clientId, userId, createdAt: at, data: { ...input, at, clientId }, summary: { propertyName: shift.property.name }, attempts: 0 });
        setQueued(true);
        return;
      }
      if (err instanceof ApiError && err.fieldErrors.reason) {
        setAsking(true);
        setReasonError(withReason ? t("checkin.reasonNeeded") : undefined);
      } else if (err instanceof ApiError && err.details.code === "already_checked_in") setFailure(err.message);
      else setFailure(errorMessage(err));
    }
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        <h2 className="m-0 text-sm font-bold">{t("tonight.shifts")}</h2>
        <div role="radiogroup" aria-label={t("checkin.pickShift")} className="flex flex-col gap-2.5">
          {(showAll || shifts.length <= SHOWN ? shifts : visibleShifts(shifts, shift)).map((s) => {
            const on = s.property.id === shift.property.id;
            const starts = Date.parse(s.startsAt);
            const until = span(now, starts);
            const since = span(starts, now);
            const soon = starts - now < 60 * 60_000;
            const tag = starts > now ? (soon ? t("tonight.startsIn", { time: durationText(t, until) }) : t("tonight.later")) : t("tonight.startedAgo", { time: durationText(t, since) });
            const buildings = s.allBuildings ? t("tonight.allBuildings") : t("tonight.bldgs", { list: buildingList(s.route.map((b) => b.name)) });
            return (
              <button
                key={s.property.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setSelected(s.property.id)}
                className={cx(
                  "flex items-center gap-3 rounded-[14px] px-3.5 py-3 text-left",
                  on ? "border-2 border-st-accent bg-st-raised" : "border border-st-track bg-st-surface",
                )}
              >
                <span aria-hidden="true" className={cx("flex size-5 flex-none items-center justify-center rounded-full border-2", on ? "border-st-accent" : "border-st-border")}>
                  {on && <span className="size-2.5 rounded-full bg-st-accent" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15.5px] font-bold">{s.property.name}</span>
                  <span className="block text-[13px] text-st-text-2">
                    {t("tonight.shiftSub", { buildings, time: wallTime(s.startTime, locale) })}
                    {s.steward && ` · ${t("tonight.shiftSteward", { name: s.steward.name })}`}
                  </span>
                </span>
                <span className={cx("flex-none rounded-full px-2.5 py-1 text-xs font-bold", soon || starts <= now ? "bg-st-warn-bg text-st-warn" : "bg-st-raised text-st-text-2")}>{tag}</span>
              </button>
            );
          })}
        </div>
        {!showAll && shifts.length > SHOWN && (
          <button type="button" onClick={() => setShowAll(true)} className="min-h-11 self-start text-[13.5px] font-semibold text-st-accent underline underline-offset-3">
            {t("checkin.showAll", { count: shifts.length })}
          </button>
        )}

        {!noPin && <CheckInMap property={shift.property} position={position} inside={area ? area.inside : null} />}
        <LocationStatus shift={shift} position={position} area={area} noPin={noPin} onRetry={() => void locate()} />
        {failure && <Notice>{failure}</Notice>}
        {queued && <Notice tone="warn">{t("checkin.queued")}</Notice>}

        {asking && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={reasonId} className="text-sm font-semibold">
              {t("checkin.reasonLabel")}
            </label>
            <textarea
              id={reasonId}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setReasonError(undefined);
              }}
              rows={3}
              maxLength={300}
              aria-invalid={reasonError ? true : undefined}
              aria-describedby={`${reasonId}-help`}
              className="rounded-xl border border-st-border bg-st-raised px-3.5 py-3 text-base text-st-text focus:border-2 focus:border-st-text focus:outline-none aria-[invalid=true]:border-st-bad"
            />
            <p id={`${reasonId}-help`} className={cx("m-0 text-[13px]", reasonError ? "font-semibold text-st-bad" : "text-st-text-3")}>
              {reasonError ?? t("checkin.reasonHint")}
            </p>
          </div>
        )}
      </div>

      <BottomAction>
        {asking ? (
          <>
            <CtaButton icon="check" onClick={() => void submit(true)} disabled={checkIn.isPending}>
              {checkIn.isPending ? t("checkin.checking") : t("checkin.reasonButton")}
            </CtaButton>
            <OutlineButton onClick={() => setAsking(false)}>{t("checkin.cancel")}</OutlineButton>
          </>
        ) : (
          <>
            <CtaButton icon="check" onClick={() => void submit(false)} disabled={checkIn.isPending || position.status === "locating"} className="min-h-16 text-lg">
              {checkIn.isPending ? t("checkin.checking") : t("checkin.button", { time: clockTime(now, locale) })}
            </CtaButton>
            <button type="button" onClick={() => setAsking(true)} className="min-h-11 text-center text-[13.5px] font-semibold text-st-accent underline underline-offset-3">
              {t("checkin.withReason")}
            </button>
          </>
        )}
      </BottomAction>
    </>
  );
}

/** Shifts listed before "Show all": most people have one to three a night. */
const SHOWN = 3;

/** The first few shifts, always including the chosen one. */
function visibleShifts(shifts: Shift[], chosen: Shift) {
  const first = shifts.slice(0, SHOWN);
  return first.includes(chosen) ? first : [...shifts.slice(0, SHOWN - 1), chosen];
}

function durationText(t: ReturnType<typeof useStewardPreferences>["t"], d: { h: number; m: number }) {
  return d.h ? t("duration.hm", { h: d.h, m: d.m }) : t("duration.m", { m: d.m });
}

function LocationStatus({
  shift,
  position,
  area,
  noPin,
  onRetry,
}: {
  shift: Shift;
  position: ReturnType<typeof usePosition>["position"];
  area: { distance: number | null; inside: boolean } | null;
  noPin: boolean;
  onRetry: () => void;
}) {
  const { t } = useStewardPreferences();
  const name = shift.property.name;
  let tone: "ok" | "warn" | "plain" = "plain";
  let title = t("checkin.locating");
  let detail = "";
  let retry = false;
  if (noPin) {
    title = t("checkin.noPin", { property: name });
    detail = t("checkin.noPinSub");
  } else if (position.status === "denied" || position.status === "unavailable") {
    tone = "warn";
    title = t(position.status === "denied" ? "checkin.denied" : "checkin.unavailable");
    detail = t(position.status === "denied" ? "checkin.deniedSub" : "checkin.unavailableSub");
    retry = true;
  } else if (area && area.distance !== null) {
    tone = area.inside ? "ok" : "warn";
    title = area.inside ? t("checkin.inside", { property: name }) : t("checkin.outside", { property: name, distance: metersLabel(area.distance) });
    detail = area.inside ? t("checkin.insideSub", { distance: metersLabel(area.distance) }) : t("checkin.outsideSub");
    retry = !area.inside;
  }
  const tones = { ok: "bg-st-ok-bg", warn: "bg-st-warn-bg", plain: "bg-st-surface" };
  const ink = { ok: "text-st-ok", warn: "text-st-warn", plain: "text-st-text-2" };
  return (
    <div role="status" className={cx("flex items-center gap-3 rounded-[14px] p-3.5", tones[tone])}>
      <Icon name={tone === "ok" ? "check" : "property"} size={26} strokeWidth={2.2} className={cx("flex-none", ink[tone])} />
      <span className="min-w-0 flex-1">
        <strong className="block text-[15px]">{title}</strong>
        {detail && <span className="block text-[13px] text-st-text-2">{detail}</span>}
      </span>
      {retry && (
        <button type="button" onClick={onRetry} className="min-h-11 flex-none rounded-xl border border-st-border px-3 text-[13px] font-bold">
          {t("checkin.retry")}
        </button>
      )}
    </div>
  );
}
