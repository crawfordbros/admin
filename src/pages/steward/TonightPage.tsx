import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useUser } from "@clerk/clerk-react";
import { BottomAction, CtaLink, EmptyState, ScreenHeader, Avatar } from "../../components/steward/ui";
import { isCrewMember, useCrewProfile } from "../../lib/steward/crew";
import { errorMessage } from "../../lib/api";
import { useStewardPreferences } from "../../lib/steward/preferences";
import { buildingList, dayLabel, useTonight } from "../../lib/steward/shifts";
import { dayPart, serviceDateLabel, serviceHour } from "../../lib/steward/time";
import { Notice } from "../../components/steward/forms";
import { cx } from "../../components/styles";
import { Icon } from "../../components/steward/icons";
import { CheckInView } from "./tonight/CheckInView";
import { OnShiftView } from "./tonight/OnShiftView";
import { WaitingPanel } from "./WaitingPage";
import { useScreenTitle } from "./useScreenTitle";
import { CommandView } from "./CommandView";
import { useCommandView, useWideScreen } from "../../components/steward/useCommandView";
import { useCrewView } from "../../components/steward/useCrewView";

/**
 * Screens 5 and 6, Check in and Tonight (docs/design/steward/Steward-CheckIn, Steward-Home): waiting for a
 * property, no service tonight, choosing a shift and checking in, or the shift in progress.
 */
export function TonightPage() {
  const command = useCommandView();
  useScreenTitle(useStewardPreferences().t("nav.tonight"));
  return command ? <CommandView /> : <ShiftView />;
}

/** "Back to the crew view", for a Steward on a tablet who opened My shift. */
function BackToCommand() {
  const t = useStewardPreferences().t;
  const wide = useWideScreen();
  const [params] = useSearchParams();
  if (useCrewView() !== "steward" || !wide || params.get("view") !== "shift") return null;
  return (
    <Link to="/steward" className="flex items-center gap-1.5 pt-4 text-[13.5px] font-bold">
      <Icon name="back" size={16} strokeWidth={2.4} />
      {t("command.backToCommand")}
    </Link>
  );
}

function ShiftView() {
  const { t, locale } = useStewardPreferences();
  const { user } = useUser();
  const profile = useCrewProfile().data!;
  const tonight = useTonight();
  const waiting = isCrewMember(profile.role) && profile.properties.length === 0;
  const onShift = tonight.data?.onShift ?? null;
  const shift = onShift && tonight.data?.shifts.find((s) => s.property.id === onShift.propertyId);
  const first = profile.firstName || user?.firstName?.trim() || "";
  const part = dayPart(serviceHour());

  const header = onShift ? (
    <ScreenHeader
      eyebrow={t("tonight.eyebrow", { property: onShift.propertyName })}
      title={shift && !shift.allBuildings ? (shift.route.length === 1 ? t("tonight.bldg", { name: shift.route[0].name }) : t("tonight.bldgs", { list: buildingList(shift.route.map((b) => b.name)) })) : t("tonight.allBuildings")}
      aside={<OnlinePill />}
    />
  ) : (
    <ScreenHeader
      leading={<Avatar name={profile.name ?? user?.fullName ?? ""} photoUrl={profile.photoUrl} size={42} />}
      eyebrow={serviceDateLabel(locale)}
      title={first ? t(`greeting.${part}`, { name: first }) : t(`greeting.noName.${part}`)}
    />
  );

  const offline = tonight.data && "offline" in tonight.data ? <Notice tone="warn">{t("offline.cached")}</Notice> : null;
  let body;
  if (waiting) body = <WaitingPanel heading={false} />;
  else if (tonight.isPending) body = <p role="status" className="text-st-text-2">{t("app.loading")}</p>;
  else if (tonight.error) body = <Notice>{errorMessage(tonight.error)}</Notice>;
  else if (onShift) body = <>{offline}<OnShiftView tonight={tonight.data} onShift={onShift} /></>;
  else if (tonight.data.shifts.length)
    return (
      <>
        <BackToCommand />
        {header}
        <div className="flex flex-1 flex-col gap-3 pt-2">
          {offline}
          <CheckInView shifts={tonight.data.shifts} />
        </div>
      </>
    );
  else
    body = (
      <EmptyState
        icon="tonight"
        title={tonight.data.serviceTonight ? t("tonight.emptyTitle") : t("tonight.noService")}
        body={
          tonight.data.serviceTonight
            ? t("tonight.emptyBody")
            : tonight.data.nextServiceNight
              ? t("tonight.nextService", { date: dayLabel(tonight.data.nextServiceNight, locale) })
              : t("tonight.noNext")
        }
      />
    );

  return (
    <>
      <BackToCommand />
      {header}
      <div className="flex flex-col gap-4 pt-2">{body}</div>
      {!waiting && (
        <BottomAction>
          <CtaLink to="/steward/violations/new" icon="camera">
            {t("tonight.logViolation")}
          </CtaLink>
        </BottomAction>
      )}
    </>
  );
}

/** Whether the phone has signal: violations and check-ins wait for it (S3 adds the offline queue). */
function OnlinePill() {
  const { t } = useStewardPreferences();
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return (
    <span className={cx("flex flex-none items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-bold", online ? "bg-st-ok-bg text-st-ok" : "bg-st-warn-bg text-st-warn")}>
      <span aria-hidden="true" className={cx("size-2 rounded-full", online ? "bg-st-ok" : "bg-st-warn")} />
      {online ? t("tonight.online") : t("tonight.offline")}
    </span>
  );
}
