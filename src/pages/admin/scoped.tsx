import { propertyLocation } from "../../lib/propertyAddress";
import { PropertyAddress } from "../../components/PropertyAddress";
import { useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { errorMessage, useApi, type ActivityPage, type AdminReportList, type AdminViolationList, type OverwatchPreview, type ReportTab, type ViolationStatus } from "../../lib/api";
import { dateTime, serviceTime, timeAgo } from "../../lib/format";
import { Alert, Button, ButtonLink } from "../../components/ui";
import { Avatar, EmptyState, Pill, Skeleton, StatusBadge } from "../../components/display";
import { SegmentedControl } from "../../components/controls";
import { Icon } from "../../components/icons";
import { cx } from "../../components/styles";
import { UnitHistory, ViolationThumb } from "../violations/shared";
import { ReplyClockChip } from "../reports/shared";

// The Violations and Issues tabs on an organization or property (ADMIN_PORTAL_SPEC 7.8, 7.10):
// the same rows as the full pages, pre-filtered, with a link to open the full page on that filter.

export type Scope = { org: string } | { property: string };
const scopeQuery = (s: Scope) => ("org" in s ? `org=${encodeURIComponent(s.org)}` : `property=${encodeURIComponent(s.property)}`);
const PAGE_SIZE = 20;
const card = "min-w-0 rounded-[14px] border border-line bg-white";

function Pager({ page, total, onPage }: { page: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (pages < 2) return null;
  return (
    <nav aria-label="Pages" className="flex items-center justify-end gap-2 border-t border-row-line px-4 py-3 text-[13.5px]">
      <span className="mr-auto text-muted">
        Page {page} of {pages}
      </span>
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className="rounded-lg border border-line px-3 py-1.5 font-semibold disabled:opacity-40">
        Previous
      </button>
      <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} className="rounded-lg border border-line px-3 py-1.5 font-semibold disabled:opacity-40">
        Next
      </button>
    </nav>
  );
}

function RowsLoading() {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-2 p-4">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-14" />
      ))}
    </div>
  );
}

const STAGES: { value: ViolationStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "new", label: "New" },
  { value: "in_review", label: "In review" },
  { value: "sent", label: "Sent" },
  { value: "resolved", label: "Resolved" },
];

export function ScopedViolations({ scope, showProperty }: { scope: Scope; showProperty?: boolean }) {
  const api = useApi();
  const [stage, setStage] = useState<ViolationStatus | "all">("all");
  const [page, setPage] = useState(1);
  const query = `${scopeQuery(scope)}&stage=${stage}&page=${page}&pageSize=${PAGE_SIZE}`;
  const list = useQuery({ queryKey: ["admin", "violations", query], queryFn: () => api<AdminViolationList>(`/admin/violations?${query}`), placeholderData: (p) => p });
  const counts = list.data?.stageCounts;
  const options = STAGES.map((s) => ({
    value: s.value,
    label: counts ? `${s.label} ${s.value === "all" ? Object.values(counts).reduce((a, b) => a + b, 0) : counts[s.value]}` : s.label,
  }));

  return (
    <section aria-label="Violations" className={card}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-row-line px-4 py-3">
        <SegmentedControl label="Stage" size="sm" options={options} value={stage} onChange={(v) => (setStage(v), setPage(1))} />
        <Link to={`/admin/violations?${scopeQuery(scope)}&stage=${stage}`} className="text-[13px] font-bold">
          Open in Violations
        </Link>
      </div>
      {list.isError ? (
        <div className="p-4">
          <Alert>{errorMessage(list.error)}</Alert>
        </div>
      ) : !list.data ? (
        <RowsLoading />
      ) : !list.data.items.length ? (
        <EmptyState icon="alert-triangle" title="No violations" body={stage === "all" ? "Nothing has been logged here yet." : "None at this stage."} />
      ) : (
        <ul className="m-0 list-none p-0">
          {list.data.items.map((v) => (
            <li key={v.id} className="border-b border-row-line last:border-b-0">
              <Link to={`/admin/violations/${v.id}`} className="flex items-center gap-3 px-4 py-3 text-ink no-underline hover:bg-subtle hover:text-ink">
                <ViolationThumb area="admin" row={v} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-bold">
                    V-{v.refNo} · {v.typeLabel}
                  </span>
                  {showProperty && <span className="block text-[13px]">{v.propertyName}<PropertyAddress property={propertyLocation(v)} /></span>}
                  <span className="block truncate text-[12.5px] text-muted">
                    {[v.building && `Building ${v.building}`, `Unit ${v.unit}`, serviceTime(v.loggedAt)].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="hidden sm:block">
                  <UnitHistory row={v} />
                </span>
                <StatusBadge kind="violation" status={v.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {list.data && <Pager page={page} total={list.data.total} onPage={setPage} />}
    </section>
  );
}

const REPORT_TABS: { value: ReportTab; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "resolved", label: "Resolved" },
  { value: "all", label: "All" },
];

export function ScopedReports({ scope, showProperty }: { scope: Scope; showProperty?: boolean }) {
  const api = useApi();
  const [tab, setTab] = useState<ReportTab>("open");
  const [page, setPage] = useState(1);
  const query = `${scopeQuery(scope)}&tab=${tab}&page=${page}&pageSize=${PAGE_SIZE}`;
  const list = useQuery({ queryKey: ["admin", "reports", query], queryFn: () => api<AdminReportList>(`/admin/reports?${query}`), placeholderData: (p) => p });
  const counts = list.data?.tabCounts;
  const options = REPORT_TABS.map((t) => ({
    value: t.value,
    label: counts && t.value !== "all" ? `${t.label} ${counts[t.value as Exclude<ReportTab, "all">]}` : t.label,
  }));

  return (
    <section aria-label="Resident issues" className={card}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-row-line px-4 py-3">
        <SegmentedControl label="Status" size="sm" options={options} value={tab} onChange={(v) => (setTab(v), setPage(1))} />
        <Link to={`/admin/issues?${scopeQuery(scope)}&tab=${tab}&dates=all`} className="text-[13px] font-bold">
          Open in Issues
        </Link>
      </div>
      {list.isError ? (
        <div className="p-4">
          <Alert>{errorMessage(list.error)}</Alert>
        </div>
      ) : !list.data ? (
        <RowsLoading />
      ) : !list.data.items.length ? (
        <EmptyState icon="message" title={tab === "open" ? "No open issues" : "No issues"} body={tab === "open" ? "Every resident issue here has been resolved." : "Residents haven't reported anything here yet."} />
      ) : (
        <ul className="m-0 list-none p-0">
          {list.data.items.map((r) => (
            <li key={r.id} className="border-b border-row-line last:border-b-0">
              <Link to={`/admin/issues/${r.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 text-ink no-underline hover:bg-subtle hover:text-ink">
                <span className="min-w-0 flex-[1_1_240px]">
                  <span className="block truncate text-[14px] font-bold">
                    #{r.refNo} · {r.issueLabel}
                  </span>
                  {showProperty && <span className="block text-[13px]">{r.propertyName}<PropertyAddress property={propertyLocation(r)} /></span>}
                  <span className="block truncate text-[12.5px] text-muted">
                    {[r.building && `Building ${r.building}`, r.unit, timeAgo(r.createdAt)].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <ReplyClockChip clock={r.replyClock} />
                <StatusBadge kind="report" status={r.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {list.data && <Pager page={page} total={list.data.total} onPage={setPage} />}
    </section>
  );
}

/** The Overwatch tab on a property: the Phase 2 note and this property's units at the threshold today. */
export function PropertyOverwatch({ propertyId }: { propertyId: string }) {
  const api = useApi();
  const preview = useQuery({ queryKey: ["admin", "overwatch"], queryFn: () => api<OverwatchPreview>("/admin/overwatch/preview") });
  const t = preview.data?.threshold;
  const units = preview.data?.units.filter((u) => u.propertyId === propertyId) ?? [];

  return (
    <>
      <section className="flex flex-wrap items-center gap-5 rounded-[14px] border border-dashed border-field bg-subtle p-5">
        <span className="flex size-11 flex-none items-center justify-center rounded-xl bg-tint-2 text-navy">
          <Icon name="eye" size={22} />
        </span>
        <div className="min-w-0 flex-[1_1_320px]">
          <h2 className="m-0 flex flex-wrap items-center gap-2 text-[17px] text-navy-ink">
            Overwatch <Pill tone="gold">Phase 2</Pill>
          </h2>
          <p className="mt-1 mb-0 text-[14px] leading-relaxed text-muted">
            Units that keep breaking the trash rules get flagged automatically, so the property can step in before it becomes a lease problem. Cases and courtesy notices arrive in Phase 2.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink to="/admin/settings#overwatch" variant="outline">
            {t ? `Threshold: ${t.count} in ${t.days} days` : "Threshold"}
          </ButtonLink>
          <button type="button" disabled className="min-h-11 cursor-not-allowed rounded-lg border border-line px-4 text-[14px] font-bold text-placeholder">
            Create Overwatch case
          </button>
        </div>
      </section>
      <section aria-labelledby="po-units" className={cx(card, "p-5")}>
        <h2 id="po-units" className="m-0 mb-3 text-[17px] text-navy-ink">
          Units at the threshold today
        </h2>
        {preview.isError ? (
          <Alert>{errorMessage(preview.error)}</Alert>
        ) : !preview.data ? (
          <Skeleton className="h-20" />
        ) : !units.length ? (
          <p className="m-0 text-[14px] text-muted">
            No unit here has {t!.count} or more violations in the last {t!.days} days.
          </p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {units.map((u) => (
              <li key={u.unit}>
                <Link
                  to={`/admin/violations?stage=all&property=${propertyId}&q=${encodeURIComponent(u.unit)}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-subtle px-4 py-3 text-ink no-underline hover:bg-tint-2 hover:text-ink"
                >
                  <strong className="text-[15px]">Unit {u.unit}</strong>
                  <span className="text-[13.5px] font-bold text-danger">
                    {u.count} in {t!.days} days
                  </span>
                  <span className="text-[13.5px] text-muted">Mostly {u.mostCommon.toLowerCase()}</span>
                  <span className="ml-auto text-[13px] text-muted">Last {timeAgo(u.lastAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

/** The Activity tab on an organization: its audit log, newest first (ADMIN_PORTAL_SPEC 7.8). */
export function OrgActivity({ orgId }: { orgId: string }) {
  const api = useApi();
  const activity = useInfiniteQuery({
    queryKey: ["admin", "org-activity", orgId],
    queryFn: ({ pageParam }) => api<ActivityPage>(`/admin/organizations/${orgId}/activity?limit=50${pageParam ? `&before=${encodeURIComponent(pageParam)}` : ""}`),
    initialPageParam: "",
    getNextPageParam: (last) => last.nextBefore ?? undefined,
  });
  const items = activity.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <section aria-label="Activity" className={card}>
      {activity.isError ? (
        <div className="p-4">
          <Alert>{errorMessage(activity.error)}</Alert>
        </div>
      ) : !activity.data ? (
        <RowsLoading />
      ) : !items.length ? (
        <EmptyState icon="list" title="No activity yet" body="Changes to this organization, its properties and its people will be listed here." />
      ) : (
        <ol className="m-0 list-none p-0">
          {items.map((e) => (
            <li key={e.id} className="flex items-start gap-3 border-b border-row-line px-4 py-3 last:border-b-0">
              {e.actor ? (
                <Avatar name={e.actor.name} seed={e.actor.id} size={30} />
              ) : (
                <span aria-hidden="true" className="flex size-[30px] flex-none items-center justify-center rounded-full bg-neutral-bg text-muted">
                  <Icon name="settings" size={15} />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block text-[14px]">{e.summary}</span>
                <time dateTime={e.createdAt} title={dateTime(e.createdAt)} className="text-[12.5px] text-muted">
                  {timeAgo(e.createdAt)}
                </time>
              </span>
            </li>
          ))}
        </ol>
      )}
      {activity.hasNextPage && (
        <div className="border-t border-row-line px-4 py-3">
          <Button variant="outline" onClick={() => activity.fetchNextPage()} disabled={activity.isFetchingNextPage}>
            {activity.isFetchingNextPage ? "Loading…" : "Show older activity"}
          </Button>
        </div>
      )}
    </section>
  );
}
