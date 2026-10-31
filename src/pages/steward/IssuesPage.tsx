import { useState } from "react";
import { Link } from "react-router-dom";
import { useUser } from "@clerk/clerk-react";
import { errorMessage } from "../../lib/api";
import { ISSUE_STATUS_KEY, clockLabel, issueByline, issueWhere, useIssues, type CrewIssue, type IssueStatus, type IssueTab } from "../../lib/steward/issues";
import { useStewardPreferences } from "../../lib/steward/preferences";
import { dayTime } from "../../lib/steward/shifts";
import { typeName } from "../../lib/steward/violations";
import { Notice } from "../../components/steward/forms";
import { EmptyState, ScreenHeader, Segmented } from "../../components/steward/ui";
import { useCrewView } from "../../components/steward/useCrewView";
import { cx } from "../../components/styles";
import { useScreenTitle } from "./useScreenTitle";

/** The card's left edge: gold waiting on someone, blue under way, red for a reply that's due, green done. */
const EDGE: Record<IssueStatus, string> = {
  new: "border-st-warn",
  assigned: "border-st-warn",
  in_progress: "border-st-info",
  resolved: "border-st-ok",
  closed: "border-st-border",
};

const PILL: Record<IssueStatus, string> = {
  new: "bg-st-raised text-st-text-2",
  assigned: "bg-st-warn-bg text-st-warn",
  in_progress: "bg-st-info-bg text-st-info",
  resolved: "bg-st-ok-bg text-st-ok",
  closed: "bg-st-raised text-st-text-3",
};

/**
 * Screen 12, Issues (docs/design/steward/Steward-Issues): resident reports assigned to you, most urgent
 * first by the 24-hour reply clock. Stewards see every issue at their properties.
 */
export function IssuesPage() {
  const { t, locale } = useStewardPreferences();
  const steward = useCrewView() === "steward";
  const { user } = useUser();
  const [tab, setTab] = useState<IssueTab>("todo");
  const issues = useIssues(tab);
  useScreenTitle(t("issues.title"));
  // While the other tab loads, the old counts stay up but not the old list.
  const counts = issues.data?.counts;
  const items = issues.isPlaceholderData ? [] : (issues.data?.items ?? []);
  const when = (iso: string) => dayTime(iso, locale, { today: t("issues.today"), yesterday: t("issues.yesterday") });

  return (
    <>
      <ScreenHeader title={t("issues.title")} intro={t(steward ? "issues.introSteward" : "issues.intro")} />
      <div className="flex flex-col gap-3 pt-1">
        <Segmented<IssueTab>
          label={t("issues.tabs")}
          value={tab}
          onChange={setTab}
          options={[
            { value: "todo", label: t("issues.todo", { n: counts?.todo ?? "–" }) },
            { value: "done", label: t("issues.done", { n: counts?.done ?? "–" }) },
          ]}
        />
        {issues.error && <Notice>{errorMessage(issues.error)}</Notice>}
        {(issues.isPending || issues.isPlaceholderData) && (
          <p role="status" className="m-0 text-st-text-2">
            {t("app.loading")}
          </p>
        )}
        {issues.isSuccess && !issues.isPlaceholderData && items.length === 0 &&
          (tab === "todo" ? (
            <EmptyState icon="issues" title={t(steward ? "issues.emptyTitleSteward" : "issues.emptyTitle")} body={t(steward ? "issues.emptyBodySteward" : "issues.emptyBody")} />
          ) : (
            <p className="m-0 text-sm text-st-text-2">{t("issues.emptyDone")}</p>
          ))}
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0 md:grid md:grid-cols-2 md:gap-3 xl:grid-cols-3">
          {items.map((i) => (
            <IssueCard key={i.id} issue={i} byline={issueByline(i, user?.id, t, when)} />
          ))}
        </ul>
      </div>
    </>
  );
}

function IssueCard({ issue: i, byline }: { issue: CrewIssue; byline: string }) {
  const { t, locale } = useStewardPreferences();
  const clock = clockLabel(i);
  return (
    <li className="min-w-0">
      <Link
        to={`/steward/issues/${i.id}`}
        className={cx(
          "flex h-full flex-col rounded-2xl border-l-4 bg-st-surface px-4 py-3.5 text-st-text no-underline hover:bg-st-raised hover:text-st-text",
          i.needsReply ? "border-st-bad" : EDGE[i.status],
        )}
      >
        <span className="flex items-baseline justify-between gap-2.5">
          <strong className="text-base">{typeName(i, locale)}</strong>
          {clock && <span className={cx("flex-none text-[12.5px] font-bold", clock.hot ? (i.needsReply ? "text-st-bad" : "text-st-warn") : "text-st-text-3")}>{t(clock.key, clock.vars)}</span>}
        </span>
        <span className="mt-0.5 block text-[13px] text-st-text-2">
          {t("issues.ref", { ref: i.refNo })} · {issueWhere(i, t)}
        </span>
        {i.description && <span className="mt-2 line-clamp-2 block text-[13.5px] text-st-text">“{i.description}”</span>}
        <span className="mt-auto flex flex-wrap items-center gap-1.5 pt-2.5">
          <IssueStatusPill status={i.status} />
          <span className="text-xs text-st-text-3">{byline}</span>
        </span>
      </Link>
    </li>
  );
}

export function IssueStatusPill({ status, className }: { status: IssueStatus; className?: string }) {
  const { t } = useStewardPreferences();
  return <span className={cx("flex-none rounded-full px-2.5 py-1 text-[11.5px] font-bold", PILL[status], className)}>{t(ISSUE_STATUS_KEY[status])}</span>;
}
