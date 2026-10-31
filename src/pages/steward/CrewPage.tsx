import { useId } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useUser } from "@clerk/clerk-react";
import { errorMessage } from "../../lib/api";
import { useCrewProfile } from "../../lib/steward/crew";
import { crewOrder, propertyTone, useCrewBoard, type CrewMember, type CrewProperty } from "../../lib/steward/crew-board";
import { useStewardPreferences } from "../../lib/steward/preferences";
import { dayLabel, wallTime } from "../../lib/steward/shifts";
import { useReview } from "../../lib/steward/violations";
import { Notice } from "../../components/steward/forms";
import { Icon } from "../../components/steward/icons";
import { Avatar, EmptyState, Panel, ScreenHeader } from "../../components/steward/ui";
import { DoorsBar, StatePill } from "../../components/steward/crewParts";
import { buildingsLabel, checkInFlags, dotClass, statusLine } from "../../lib/steward/crew-display";
import { cx } from "../../components/styles";
import { useScreenTitle } from "./useScreenTitle";

/**
 * Screen 8, Crew (docs/design/steward/Steward-Crew): at each property the Steward runs, who's in, who's
 * late and each person's doors, with Text, Call and Reassign for someone late. Refreshes every minute.
 */
export function CrewPage() {
  const { t, locale } = useStewardPreferences();
  const { user } = useUser();
  const profile = useCrewProfile().data;
  const board = useCrewBoard();
  const [params, setParams] = useSearchParams();
  const tabsId = useId();
  useScreenTitle(t("nav.crew"));
  const name = profile?.name || user?.fullName?.trim() || user?.primaryEmailAddress?.emailAddress || "";
  const header = <ScreenHeader eyebrow={t("crew.eyebrow", { name })} title={t("crew.title")} />;

  if (board.isPending) return <>{header}<p role="status" className="text-st-text-2">{t("app.loading")}</p></>;
  if (board.error) return <>{header}<Notice>{errorMessage(board.error)}</Notice></>;
  const { properties } = board.data;
  if (properties.length === 0) {
    return (
      <>
        {header}
        <div className="pt-2">
          <EmptyState icon="crew" title={t("crew.emptyTitle")} body={t("crew.emptyBody")} />
        </div>
      </>
    );
  }

  const selected = properties.find((p) => p.id === params.get("p")) ?? properties[0];
  const choose = (id: string) => setParams((prev) => { const next = new URLSearchParams(prev); next.set("p", id); return next; }, { replace: true });
  const next = board.data.nextServiceNight ? t("tonight.nextService", { date: dayLabel(board.data.nextServiceNight, locale) }) : "";

  return (
    <>
      {header}
      <div className="flex flex-col gap-3 pt-2 pb-4">
        {properties.length > 1 && (
          <div role="tablist" aria-label={t("crew.chooseProperty")} className="-mx-5 flex gap-1.5 overflow-x-auto px-5 pb-0.5 md:mx-0 md:px-0">
            {properties.map((p) => {
              const on = p.id === selected.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="tab"
                  id={`${tabsId}-${p.id}`}
                  aria-selected={on}
                  aria-controls={`${tabsId}-panel`}
                  onClick={() => choose(p.id)}
                  className={cx(
                    "flex min-h-10 flex-none items-center gap-1.5 rounded-full px-3.5 text-[13px] font-bold whitespace-nowrap",
                    on ? "bg-st-cta text-st-on-cta" : "border border-st-border text-st-text-2 hover:text-st-text",
                  )}
                >
                  {p.name} · {wallTime(p.startTime, locale)}
                  <span aria-hidden="true" className={cx("size-2 rounded-full", dotClass(propertyTone(p)))} />
                </button>
              );
            })}
          </div>
        )}
        {!board.data.serviceTonight && <Notice tone="warn">{t("crew.noService", { next })}</Notice>}
        <LateAlerts property={selected} />
        <div id={`${tabsId}-panel`} role={properties.length > 1 ? "tabpanel" : undefined} aria-labelledby={properties.length > 1 ? `${tabsId}-${selected.id}` : undefined}>
          <PropertyCrew property={selected} />
        </div>
        <ReviewLink />
      </div>
    </>
  );
}

/** One callout per person who's late at the property, as on the design. */
function LateAlerts({ property: p }: { property: CrewProperty }) {
  const { t, locale } = useStewardPreferences();
  const late = p.crew.filter((m) => m.state === "late");
  return late.map((m) => {
    const untouched = p.buildings.filter((b) => (m.buildings.length ? m.buildings.includes(b.name) : false) && b.doorsDone === 0).map((b) => b.name);
    return (
      <div key={m.id} className="flex items-start gap-3 rounded-[14px] bg-st-bad-bg px-3.5 py-3 text-st-text">
        <Icon name="violations" size={22} strokeWidth={2.2} className="flex-none text-st-bad" />
        <p className="m-0 text-[13.5px] leading-snug">
          <strong className="block text-[14.5px]">{t("crew.lateTitle", { name: m.name })}</strong>
          {t("crew.lateBody", { time: wallTime(p.startTime, locale), minutes: m.minutesLate ?? 0 })}
          {untouched.length > 0 && ` ${t("crew.lateBuildings", { buildings: buildingsLabel(untouched, t) })}`}
        </p>
      </div>
    );
  });
}

function PropertyCrew({ property: p }: { property: CrewProperty }) {
  const { t } = useStewardPreferences();
  const crew = crewOrder(p.crew);
  return (
    <Panel className="flex flex-col gap-3 px-3.5 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="m-0 text-[15px] font-bold">{p.name}</h2>
        <span className="flex-none text-[13px] text-st-text-2">{t("crew.doors", { done: p.doors.done, total: p.doors.total })}</span>
      </div>
      <DoorsBar doors={p.doors} className="h-2" />
      {crew.length === 0 ? (
        <div>
          <h3 className="m-0 text-[14.5px] font-bold">{t("crew.noCrewTitle")}</h3>
          <p className="mt-0.5 mb-0 text-[13.5px] text-st-text-2">{t("crew.noCrewBody")}</p>
        </div>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0 md:grid md:grid-cols-2">
          {crew.map((m) => (
            <CrewRow key={m.id} member={m} property={p} />
          ))}
        </ul>
      )}
      <Link
        to={`/steward/crew/${p.id}`}
        className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-st-border text-sm font-bold text-st-text no-underline hover:bg-st-raised hover:text-st-text"
      >
        <Icon name="property" size={18} strokeWidth={2} />
        {t("crew.manage")}
      </Link>
    </Panel>
  );
}

function CrewRow({ member: m, property: p }: { member: CrewMember; property: CrewProperty }) {
  const { t, locale } = useStewardPreferences();
  const late = m.state === "late" || m.state === "due";
  const flags = checkInFlags(m, t);
  const first = m.name.split(" ")[0];
  return (
    <li className={cx("rounded-xl bg-st-raised px-3 py-2.5", m.state === "late" && "outline-1 outline-st-bad")}>
      <div className="flex items-center gap-3">
        <Avatar name={m.name} photoUrl={m.photoUrl} size={44} ring={false} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-bold">{m.name}</span>
          <span className="block text-[12.5px] text-st-text-2">
            {buildingsLabel(m.buildings, t)} · {statusLine(m, p.startTime, t, locale)}
          </span>
        </span>
        <StatePill member={m} t={t} />
      </div>
      <DoorsBar doors={m.doors} className="mt-2" />
      {flags.map((f) => (
        <p key={f} className="mt-2 mb-0 text-[12.5px] font-semibold text-st-warn">
          {f}
        </p>
      ))}
      {late && (
        <div className="mt-2.5 grid grid-cols-3 gap-2">
          {m.phone ? (
            <>
              <a href={`sms:${m.phone}`} aria-label={t("crew.textLabel", { name: first })} className="flex min-h-11 items-center justify-center rounded-[10px] bg-st-cta text-[13.5px] font-bold text-st-on-cta no-underline hover:text-st-on-cta">
                {t("crew.text")}
              </a>
              <a href={`tel:${m.phone}`} aria-label={t("crew.callLabel", { name: first })} className="flex min-h-11 items-center justify-center rounded-[10px] border border-st-border text-[13.5px] font-bold text-st-text no-underline hover:text-st-text">
                {t("crew.call")}
              </a>
            </>
          ) : (
            <span className="col-span-2" />
          )}
          <Link
            to={`/steward/crew/${p.id}?reassign=${encodeURIComponent(m.id)}`}
            aria-label={t("crew.reassignLabel", { name: first })}
            className="flex min-h-11 items-center justify-center rounded-[10px] border border-st-border text-[13.5px] font-bold text-st-text no-underline hover:text-st-text"
          >
            {t("crew.reassign")}
          </Link>
        </div>
      )}
    </li>
  );
}

/** Violations waiting for the Steward, as on the design: a link to Review with the count. */
function ReviewLink() {
  const t = useStewardPreferences().t;
  const review = useReview();
  const n = review.data?.items.length ?? 0;
  return (
    <Link to="/steward/review" className="flex items-center gap-3 rounded-2xl bg-st-surface px-4 py-3.5 text-st-text no-underline hover:text-st-text">
      <span className={cx("flex size-[42px] flex-none items-center justify-center rounded-xl text-base font-bold", n ? "bg-st-warn-bg text-st-warn" : "bg-st-raised text-st-text-2")}>{n}</span>
      <span className="min-w-0 flex-1">
        <strong className="block text-[15px]">{t("crew.review")}</strong>
        <span className="text-[12.5px] text-st-text-2">{n ? t("crew.reviewBody") : t("crew.reviewNone")}</span>
      </span>
      <Icon name="chevron" size={18} strokeWidth={2.2} className="text-st-text-3" />
    </Link>
  );
}
