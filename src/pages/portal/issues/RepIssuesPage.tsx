import { propertyLocation } from "../../../lib/propertyAddress";
import { PropertyAddress } from "../../../components/PropertyAddress";
import { propertyOptionLabel } from "../../../lib/propertyAddress";
import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useParams } from "react-router-dom";
import { errorMessage, useApi, useApiBlob, type PortalIssueDetail, type PortalIssueList, type PortalIssueRow, type ReplyClock } from "../../../lib/api";
import { nyToday, serviceTime, whereLabel } from "../../../lib/format";
import { useQueryState } from "../../../lib/useQueryState";
import { usePortalPage } from "../../../components/admin/adminPage";
import { Tabs } from "../../../components/controls";
import { Pagination } from "../../../components/DataTable";
import { Pill, Skeleton, StatusBadge } from "../../../components/display";
import { Icon } from "../../../components/icons";
import { IssueThread } from "../../../components/portal/IssueThread";
import { useRepContext } from "../../../components/portal/RepContext";
import { cx } from "../../../components/styles";
import { useToast } from "../../../components/Toast";
import { Alert, Button } from "../../../components/ui";

type Tab = "open" | "resolved" | "all";
const TABS: Tab[] = ["open", "resolved", "all"];
const PAGE_SIZE = 25;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const where = (r: PortalIssueRow) => whereLabel(r.building, r.unit, "Building");

/** "Reply due in 18h", "Reply overdue", "Replied in 3h". */
function ClockPill({ clock }: { clock: ReplyClock }) {
  if (clock.state === "replied") return <Pill tone="neutral">Replied in {Math.max(1, Math.round(clock.hours))}h</Pill>;
  if (clock.state === "open") {
    return clock.hoursLeft < 0 ? <Pill tone="danger">Reply overdue</Pill> : <Pill tone="warning">Reply due in {Math.max(1, Math.ceil(clock.hoursLeft))}h</Pill>;
  }
  return null;
}

/** "3h 12m" */
const duration = (hours: number) => {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return h ? `${h}h ${m}m` : `${m}m`;
};

/** "Tue, Oct 27 at 10:31 PM" in Atlanta time. */
function at(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric" })} at ${d.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" })}`;
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[12.5px] font-semibold text-muted">{label}</dt>
      <dd className="m-0 font-bold">{children}</dd>
    </div>
  );
}

/** One issue: who reported it, CBES's replies, and Email me updates. Nothing here changes the issue. */
function IssueDetail({ id, backTo, opened }: { id: string; backTo: string; opened: boolean }) {
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const key = ["portal", "issue", id];
  const { data: d, error, isPending } = useQuery({ queryKey: key, queryFn: () => api<PortalIssueDetail>(`/portal/issues/${id}`) });
  // Shown beside the list without being opened, it leaves the page's title and breadcrumb alone.
  usePortalPage(opened && d ? `#${d.refNo} ${d.issueLabel}` : null, opened && d ? [{ label: "Resident issues", to: backTo }, { label: `#${d.refNo}` }] : undefined);
  const follow = useMutation({
    mutationFn: (on: boolean) => api<{ following: boolean }>(`/portal/issues/${id}/follow`, { method: on ? "POST" : "DELETE" }),
    onSuccess: ({ following }) => {
      queryClient.setQueryData<PortalIssueDetail>(key, (old) => (old ? { ...old, following } : old));
      toast.success(following ? "We'll email you when CBES replies or resolves it." : "You won't get emails about this issue.");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (isPending) {
    return (
      <div className="flex flex-col gap-3 p-6">
        <Skeleton className="h-7 w-1/2" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (error) return <div className="p-6"><Alert>{errorMessage(error)}</Alert></div>;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3.5 border-b border-row-line px-6 py-5">
        <div className="min-w-0">
          <p className="m-0 flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-bold text-muted">#{d.refNo}</span>
            <StatusBadge kind="portalIssue" status={d.statusLabel} />
          </p>
          <h2 id="issue-title" className="mt-1.5 mb-0 text-[24px] text-navy-ink">
            {d.issueLabel}
          </h2>
          <p className="m-0 mt-1 text-[14px]">{d.propertyName}<PropertyAddress property={propertyLocation(d)} /></p>
          <p className="m-0 mt-1 text-[13.5px] text-muted">{[where(d), at(d.createdAt)].filter(Boolean).join(" · ")}</p>
        </div>
        {d.firstReplyHours !== null ? (
          <span className="rounded-[10px] bg-success-bg px-3 py-1.5 text-[12.5px] font-bold text-success">First reply in {duration(d.firstReplyHours)}</span>
        ) : (
          <ClockPill clock={d.replyClock} />
        )}
      </div>
      <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3.5 border-b border-row-line px-6 py-5 text-[14px]">
        <Fact label="Resident">{d.resident.name}</Fact>
        {d.resident.email && <Fact label="Email">{d.resident.email}</Fact>}
        {d.resident.phone && (
          <Fact label="Phone">
            {d.resident.phone}
            {d.resident.okToCall && <span className="block text-[12px] font-bold text-success">OK to call</span>}
          </Fact>
        )}
        <Fact label="Assigned at CBES">{d.assignee ? `${d.assignee.name}, ${d.assignee.title === "CBES Steward" ? "Steward" : "CBES"}` : "Not yet"}</Fact>
      </dl>
      <div className="px-6 py-5">
        <IssueThread events={d.events} resident={d.resident.name} photos={d.photos} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 pb-6">
        <p className="m-0 flex flex-[1_1_320px] items-start gap-2.5 rounded-xl bg-subtle px-3.5 py-3 text-[13px] text-muted">
          <Icon name="eye" size={18} strokeWidth={2} className="flex-none" />
          View only. CBES staff reply to the resident and close the issue once it's fixed.
        </p>
        <button
          type="button"
          aria-pressed={d.following}
          onClick={() => follow.mutate(!d.following)}
          disabled={follow.isPending}
          className={cx(
            "inline-flex h-10 items-center gap-2 rounded-[10px] px-3.5 text-[13.5px] font-bold disabled:opacity-60",
            d.following ? "bg-tint-2 text-navy-ink" : "border border-field bg-white text-navy hover:bg-canvas",
          )}
        >
          <Icon name={d.following ? "check" : "bell"} size={16} strokeWidth={2} />
          {d.following ? "Following" : "Email me updates"}
        </button>
      </div>
    </>
  );
}

/**
 * /portal/issues and /portal/issues/:reportId (REP_PORTAL_SPEC 7.7): what residents reported and how
 * CBES is handling it, view-only. The list and the open issue sit side by side from 1024 px; below
 * that, an open issue replaces the list.
 */
export function RepIssuesPage() {
  const { reportId } = useParams();
  const { search } = useLocation();
  const api = useApi();
  const blob = useApiBlob();
  const toast = useToast();
  const { params, update } = useQueryState();
  const ctx = useRepContext();
  usePortalPage(reportId ? null : "Resident issues");

  const org = params.get("org");
  const property = params.get("property");
  const scope = property ? { property } : org ? { org } : ctx.scope;
  const tab = (TABS.includes(params.get("tab") as Tab) ? params.get("tab") : "open") as Tab;
  const page = Math.max(1, Number(params.get("page")) || 1);
  const query = new URLSearchParams({ ...(scope ?? {}), tab });
  const exportQuery = query.toString();
  query.set("page", String(page));
  query.set("pageSize", String(PAGE_SIZE));

  const { data, error, isPending, refetch, isFetching } = useQuery({
    queryKey: ["portal", "issues", "list", query.toString()],
    queryFn: () => api<PortalIssueList>(`/portal/issues?${query}`),
    enabled: Boolean(scope),
    placeholderData: (prev) => prev,
  });

  const exportCsv = async () => {
    try {
      const file = await blob(`/portal/issues/export.csv?${exportQuery}`);
      if (!file) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(file);
      a.download = `resident-issues-${nyToday()}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  // Without an issue in the URL, the first one shows beside the list on wide screens.
  const shown = reportId ?? data?.items[0]?.id;
  const listPath = `/portal/issues${search}`;
  const showProperty = ctx.kind === "organization" || ctx.properties.length > 1;
  const counts = data?.tabCounts;

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 flex-[1_1_420px]">
          <h1 className="m-0 text-[30px] text-navy-ink">Resident issues</h1>
          <p className="mt-1.5 mb-0 text-[14.5px] text-muted">
            What residents report from the QR code on their container. CBES staff handle every issue and reply within 24 hours. You can see everything, as it happens.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {showProperty && (
            <label className="flex h-[42px] items-center gap-2 rounded-[10px] border border-field bg-white px-3 text-[13.5px] font-semibold text-muted focus-within:border-navy focus-within:ring-2 focus-within:ring-navy/25">
              Property
              <select
                value={property ?? ""}
                onChange={(e) => update(e.target.value ? { property: e.target.value, org: null } : ctx.kind === "organization" && ctx.org ? { org: ctx.org.id, property: null } : { property: null })}
                className="border-0 bg-transparent text-[13.5px] font-bold text-ink outline-none"
              >
                {ctx.kind === "organization" && <option value="">All {plural(ctx.properties.length, "property", "properties")}</option>}
                {ctx.properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {propertyOptionLabel(p)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <Button variant="secondary" onClick={exportCsv} disabled={!data}>
            <Icon name="download" size={18} strokeWidth={2} />
            Export CSV
          </Button>
        </div>
      </div>

      {error ? (
        <Alert>
          {errorMessage(error)}{" "}
          <Button variant="secondary" onClick={() => refetch()} disabled={isFetching} className="ml-2 min-h-9 px-3 py-1 text-[14px]">
            Retry
          </Button>
        </Alert>
      ) : (
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <section aria-label="Issues" className={cx("min-w-0 overflow-hidden rounded-2xl border border-line bg-white", reportId && "hidden lg:block")}>
            <div className="px-3">
              <Tabs
                variant="underline"
                label="Issue status"
                value={tab}
                onChange={(t) => update({ tab: t === "open" ? null : t })}
                tabs={[
                  { value: "open", label: "Open", count: counts?.open },
                  { value: "resolved", label: "Resolved", count: counts?.resolved },
                  { value: "all", label: "All", count: counts?.all },
                ]}
              />
            </div>
            {isPending ? (
              <div className="flex flex-col gap-3 p-4" role="status" aria-label="Loading">
                {Array.from({ length: 4 }, (_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : data && data.items.length === 0 ? (
              <p className="m-0 px-5 py-10 text-center text-[14.5px] text-muted">{tab === "open" ? "No open issues. CBES will show new ones here as residents report them." : "No issues here yet."}</p>
            ) : (
              <ul className="m-0 list-none p-0">
                {data?.items.map((r) => {
                  const current = r.id === shown;
                  return (
                    <li key={r.id}>
                      <Link
                        to={`/portal/issues/${r.id}${search}`}
                        aria-current={current ? "true" : undefined}
                        className={cx("block border-b border-row-line px-4 py-3.5 text-ink no-underline hover:bg-subtle hover:text-ink", current && "bg-tint-2 shadow-[inset_4px_0_0_var(--color-navy)] hover:bg-tint-2")}
                      >
                        <span className="flex items-baseline justify-between gap-2">
                          <strong className="text-[14.5px]">{r.issueLabel}</strong>
                          <span className="text-[12px] whitespace-nowrap text-muted">{serviceTime(r.createdAt)}</span>
                        </span>
                        <span className="mt-1 block text-[13px]">{r.propertyName}<PropertyAddress property={propertyLocation(r)} /></span>
                        <span className="mt-0.5 block text-[12.5px] text-muted">{[`#${r.refNo}`, where(r)].filter(Boolean).join(" · ")}</span>
                        <span className="mt-2 flex flex-wrap gap-1.5">
                          <StatusBadge kind="portalIssue" status={r.statusLabel} />
                          <ClockPill clock={r.replyClock} />
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            {data && data.total > PAGE_SIZE && <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onChange={(p) => update({ page: p > 1 ? String(p) : null })} noun="issues" />}
          </section>

          <section aria-labelledby="issue-title" className={cx("min-w-0 overflow-hidden rounded-2xl border border-line bg-white", !reportId && "hidden lg:block")}>
            {reportId && (
              <Link to={`/portal/issues${search}`} className="flex items-center gap-1.5 px-6 pt-4 text-[14px] font-bold no-underline lg:hidden">
                <Icon name="chevron-left" size={16} strokeWidth={2.2} />
                All issues
              </Link>
            )}
            {shown ? (
              <IssueDetail key={shown} id={shown} backTo={listPath} opened={Boolean(reportId)} />
            ) : (
              <p className="m-0 px-6 py-10 text-center text-[14.5px] text-muted">{isPending ? "Loading…" : "Choose an issue to see the conversation."}</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
