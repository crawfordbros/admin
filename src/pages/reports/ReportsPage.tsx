import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  errorMessage,
  useApi,
  useApiBlob,
  type AdminPropertyRow,
  type AdminReportList,
  type OrganizationRow,
  type ReportStatus,
  type ReportTab,
  type ReportsSummary,
  type SavedView,
} from "../../lib/api";
import { DATE_PRESETS, dateRange } from "../../lib/dates";
import { formatDay, nyToday, replyHours, timeAgo } from "../../lib/format";
import { useQueryState } from "../../lib/useQueryState";
import { Alert, Button } from "../../components/ui";
import { Avatar, EmptyState, PageHeader, Skeleton, StatusBadge } from "../../components/display";
import { statusLabel } from "../../components/displayUtils";
import { Tabs } from "../../components/controls";
import { Donut, HBarList, Legend, Sparkline, StackedBars } from "../../components/charts/charts";
import { FilterBar, SearchField, type FilterDef, type FilterValue } from "../../components/FilterBar";
import { DataTable, Pagination } from "../../components/DataTable";
import { Menu } from "../../components/Popover";
import { Modal } from "../../components/overlay";
import { Icon } from "../../components/icons";
import { useToast } from "../../components/Toast";
import { useAdminPage } from "../../components/admin/adminPage";
import { cx } from "../../components/styles";
import { IssueIcon, ReplyClockChip, SourceChip } from "./shared";
import { PhoneReportModal } from "./PhoneReportModal";

const FILTER_KEYS = ["org", "property", "dates", "type", "source", "assignee"] as const;
const PAGE_SIZE = 25;
const TABS: Exclude<ReportTab, "all">[] = ["open", "new", "in_progress", "resolved", "closed"];
const TAB_LABELS: Record<Exclude<ReportTab, "all">, string> = { open: "Open", new: "New", in_progress: "In progress", resolved: "Resolved", closed: "Closed" };
const SORTS = { submitted: "Newest first", clock: "Most urgent reply", property: "Property" } as const;
const BULK_STATUSES: ReportStatus[] = ["new", "assigned", "in_progress", "resolved", "closed"];

const card = "rounded-[14px] border border-line bg-white p-5";

/** /admin/reports: every resident report, with filters, charts and the 24-hour reply clock (ADMIN_PORTAL_SPEC 7.2). */
export function ReportsPage() {
  const api = useApi();
  const blob = useApiBlob();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { params, update, list } = useQueryState();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [logging, setLogging] = useState(false);
  const [naming, setNaming] = useState(false);
  useAdminPage("Reports");

  const tab = (TABS.includes(params.get("tab") as never) ? params.get("tab") : "open") as Exclude<ReportTab, "all">;
  const sort = (params.get("sort") ?? "submitted") as keyof typeof SORTS;
  const page = Math.max(1, Number(params.get("page") ?? 1) || 1);
  const q = params.get("q") ?? "";
  // Dates default to the last 30 days; "all" is any time.
  const dates = params.get("dates") === "all" ? [] : params.get("dates") ? list("dates") : ["30d"];
  const filters: FilterValue = { ...Object.fromEntries(FILTER_KEYS.map((k) => [k, list(k)])), dates };

  const filterQuery = new URLSearchParams();
  for (const k of ["org", "property", "type", "source", "assignee"] as const) if (filters[k]?.length) filterQuery.set(k, filters[k]!.join(","));
  const { from, to } = dateRange(dates);
  if (from) filterQuery.set("from", from);
  if (to) filterQuery.set("to", to);
  if (q.trim()) filterQuery.set("q", q.trim());
  const listQuery = new URLSearchParams(filterQuery);
  listQuery.set("tab", tab);
  listQuery.set("sort", sort);
  listQuery.set("page", String(page));
  listQuery.set("pageSize", String(PAGE_SIZE));

  const reports = useQuery({ queryKey: ["admin", "reports", "list", listQuery.toString()], queryFn: () => api<AdminReportList>(`/admin/reports?${listQuery}`), placeholderData: (p) => p });
  const summary = useQuery({ queryKey: ["admin", "reports", "summary", filterQuery.toString()], queryFn: () => api<ReportsSummary>(`/admin/reports/summary?${filterQuery}`), placeholderData: (p) => p });
  const options = useFilterOptions(filters.org ?? []);
  const views = useQuery({ queryKey: ["saved-views", "reports"], queryFn: () => api<{ items: SavedView[] }>("/saved-views?page=reports") });

  const bulk = useMutation({
    mutationFn: (body: { status?: ReportStatus; assigneeUserId?: string | null }) => api<{ updated: number }>("/admin/reports/bulk", { method: "POST", body: JSON.stringify({ ids: [...selected], ...body }) }),
    onSuccess: async ({ updated }) => {
      toast.success(`${updated} report${updated === 1 ? "" : "s"} updated.`);
      setSelected(new Set());
      await queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const removeView = useMutation({
    mutationFn: (id: string) => api(`/saved-views/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["saved-views", "reports"] }),
    onError: (err) => toast.error(errorMessage(err)),
  });

  const exportCsv = async () => {
    try {
      const exportQuery = new URLSearchParams(filterQuery);
      exportQuery.set("tab", tab);
      const file = await blob(`/admin/reports/export.csv?${exportQuery}`);
      if (!file) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(file);
      a.download = `resident-reports-${nyToday()}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const setFilters = (v: FilterValue) =>
    update({
      ...Object.fromEntries(FILTER_KEYS.filter((k) => k !== "dates").map((k) => [k, v[k] ?? null])),
      dates: v.dates?.length ? (v.dates.length === 1 && v.dates[0] === "30d" ? null : v.dates) : "all",
    });
  const applyOnly = (key: "type" | "property", value: string) => update({ [key]: value });
  const openReport = (id: string) => navigate({ pathname: `/admin/reports/${id}`, search: location.search });

  const filterDefs: FilterDef[] = [
    { key: "org", label: "Organization", icon: "building", type: "multi", options: options.orgs },
    { key: "property", label: "Property", icon: "home", type: "multi", options: options.properties },
    { key: "dates", label: "Dates", icon: "calendar", type: "date", presets: DATE_PRESETS, allLabel: "Any time" },
    { key: "type", label: "Issue type", type: "multi", options: options.types },
    {
      key: "source",
      label: "Source",
      type: "multi",
      options: [
        { value: "web", label: "Web" },
        { value: "qr", label: "QR" },
        { value: "phone", label: "Phone" },
      ],
    },
    { key: "assignee", label: "Assigned to", icon: "users", type: "multi", allLabel: "Anyone", options: [{ value: "none", label: "Unassigned" }, ...options.assignees] },
  ];
  const s = summary.data;
  const data = reports.data;

  return (
    <>
      <PageHeader
        title="Resident reports"
        description="Every issue residents report, across all organizations and properties. Each one gets a reply within 24 hours."
        actions={
          <>
            <Button variant="secondary" onClick={exportCsv}>
              <Icon name="download" size={18} strokeWidth={2} />
              Export CSV
            </Button>
            <Button onClick={() => setLogging(true)}>
              <Icon name="phone" size={18} strokeWidth={2} />
              Log a phone report
            </Button>
          </>
        }
      />

      <section aria-label="Filters" className={cx(card, "p-4!")}>
        <FilterBar
          filters={filterDefs}
          value={filters}
          onChange={setFilters}
          search={<SearchField label="Search reports" placeholder="Report number, unit or resident" value={q} onChange={(v) => update({ q: v })} />}
          savedViews={{
            views: views.data?.items ?? [],
            onApply: (id) => {
              const v = views.data?.items.find((x) => x.id === id);
              if (v) navigate({ pathname: "/admin/reports", search: v.query });
            },
            onSave: () => setNaming(true),
          }}
        />
        {(views.data?.items.length ?? 0) > 0 && (
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-muted">
            Saved views:
            {views.data!.items.map((v) => (
              <span key={v.id} className="inline-flex items-center gap-1">
                <Link to={{ pathname: "/admin/reports", search: v.query }} className="font-bold text-ink no-underline hover:underline">
                  {v.name}
                </Link>
                <Menu
                  label={`Saved view ${v.name}`}
                  items={[{ label: `Delete “${v.name}”`, tone: "danger", onSelect: () => removeView.mutate(v.id) }]}
                  trigger={(p) => (
                    <button type="button" {...p} aria-label={`Options for ${v.name}`} className="flex size-6 items-center justify-center rounded text-muted hover:bg-canvas">
                      <Icon name="more" size={16} strokeWidth={2.4} />
                    </button>
                  )}
                />
              </span>
            ))}
          </div>
        )}
      </section>

      <Kpis summary={s} />

      <div className="flex flex-wrap gap-5">
        <section className={cx(card, "min-w-0 flex-[2_1_560px]")}>
          <div className="mb-2.5 flex flex-wrap items-start justify-between gap-2.5">
            <div>
              <h2 className="m-0 text-lg text-ink">Reports by week</h2>
              <p className="mt-0.5 mb-0 text-[13px] text-muted">Stacked by current status, last 12 weeks</p>
            </div>
            <Legend
              items={[
                { label: "Resolved", tone: "success" },
                { label: "In progress", tone: "navy" },
                { label: "New", tone: "gold-light" },
              ]}
            />
          </div>
          {s ? (
            <StackedBars
              label={`Resident reports per week for the last 12 weeks, ${s.byWeek.reduce((n, w) => n + w.resolved + w.inProgress + w.new, 0)} in all`}
              data={s.byWeek.map((w) => ({ label: formatDay(w.weekStart).slice(5), resolved: w.resolved, inProgress: w.inProgress, new: w.new }))}
              series={[
                { key: "resolved", label: "Resolved", tone: "success" },
                { key: "inProgress", label: "In progress", tone: "navy" },
                { key: "new", label: "New", tone: "gold-light" },
              ]}
            />
          ) : (
            <Skeleton className="h-[220px] w-full" />
          )}
        </section>
        <section className={cx(card, "min-w-0 flex-[1_1_300px]")}>
          <h2 className="m-0 text-lg text-ink">24-hour reply promise</h2>
          <p className="mt-0.5 mb-3 text-[13px] text-muted">Share of reports with a first reply within 24 hours</p>
          {s && <ReplyPromise buckets={s.replyBuckets} />}
        </section>
      </div>

      <div className="flex flex-wrap gap-5">
        <section className={cx(card, "min-w-0 flex-[1_1_380px]")}>
          <h2 className="m-0 mb-3.5 text-lg text-ink">By issue type</h2>
          {s && s.byType.length === 0 && <p className="m-0 text-muted">No reports in this range.</p>}
          {s && (
            <HBarList
              label="Reports by issue type"
              items={s.byType.map((t) => ({
                key: t.key,
                value: t.count,
                label: (
                  <button type="button" onClick={() => applyOnly("type", t.key)} className="text-left font-semibold text-ink hover:underline" title={`Show only ${t.label}`}>
                    {t.label}
                  </button>
                ),
              }))}
            />
          )}
        </section>
        <section className={cx(card, "min-w-0 flex-[1.4_1_480px]")}>
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
            <h2 className="m-0 text-lg text-ink">By property</h2>
            <span className="text-[12.5px] text-muted">Reports per 100 units</span>
          </div>
          {s && s.byProperty.length === 0 && <p className="m-0 text-muted">No reports in this range.</p>}
          {s && s.byProperty.length > 0 && <ByProperty rows={s.byProperty} onPick={(id) => applyOnly("property", id)} />}
        </section>
      </div>

      <section className="overflow-hidden rounded-[14px] border border-line bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-5">
          <Tabs
            label="Status"
            value={tab}
            onChange={(t) => {
              setSelected(new Set());
              update({ tab: t === "open" ? null : t });
            }}
            tabs={TABS.map((t) => ({ value: t, label: TAB_LABELS[t], count: data?.tabCounts[t] }))}
          />
          {selected.size > 0 ? (
            <div role="region" aria-label="Selected reports" className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
              <span>{selected.size} selected</span>
              <Menu
                label="Assign to"
                items={[{ label: "Unassigned", onSelect: () => bulk.mutate({ assigneeUserId: null }) }, ...options.assignees.map((a) => ({ label: a.label, onSelect: () => bulk.mutate({ assigneeUserId: a.value }) }))]}
                trigger={(p) => (
                  <Button variant="secondary" {...p} className="min-h-9! px-3! text-[13px]">
                    Assign
                  </Button>
                )}
              />
              <Menu
                label="Change status"
                items={BULK_STATUSES.map((st) => ({ label: statusLabel("report", st), onSelect: () => bulk.mutate({ status: st }) }))}
                trigger={(p) => (
                  <Button variant="secondary" {...p} className="min-h-9! px-3! text-[13px]">
                    Change status
                  </Button>
                )}
              />
            </div>
          ) : (
            <label className="flex items-center gap-2 text-[13px] font-semibold">
              Sort
              <select value={sort} onChange={(e) => update({ sort: e.target.value === "submitted" ? null : e.target.value })} className="h-9 rounded-[9px] border border-field bg-white px-2 text-[13px]">
                {(Object.keys(SORTS) as (keyof typeof SORTS)[]).map((k) => (
                  <option key={k} value={k}>
                    {SORTS[k]}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {reports.error && (
          <div className="p-4">
            <Alert>{errorMessage(reports.error)}</Alert>
          </div>
        )}
        <DataTable
          label="Resident reports"
          rows={data?.items ?? []}
          loading={reports.isPending}
          rowKey={(r) => r.id}
          selectable
          selected={selected}
          onSelect={setSelected}
          onRowClick={(r) => openReport(r.id)}
          minWidth={980}
          empty={<EmptyState icon="message" title={`No ${TAB_LABELS[tab].toLowerCase()} reports`} body={tab === "open" ? "Every report in this range has been handled." : "Nothing matches these filters."} />}
          columns={[
            {
              key: "report",
              header: "Report",
              cell: (r) => (
                <span className="flex items-center gap-2.5">
                  <IssueIcon issueKey={r.issueKey} />
                  <span>
                    <Link to={{ pathname: `/admin/reports/${r.id}`, search: location.search }} className="block font-bold text-ink no-underline hover:underline">
                      {r.issueLabel}
                    </Link>
                    <span className="text-[12px] text-muted">
                      #{r.refNo} · {timeAgo(r.createdAt)}
                    </span>
                  </span>
                </span>
              ),
            },
            {
              key: "property",
              header: "Organization · Property",
              cell: (r) => (
                <>
                  <span className="block font-semibold">{r.propertyName}</span>
                  <span className="text-[12px] text-muted">{r.orgName ?? "No organization"}</span>
                </>
              ),
            },
            { key: "unit", header: "Unit", cell: (r) => [r.building && `Bldg ${r.building}`, r.unit].filter(Boolean).join(" · ") || <span className="text-muted">—</span> },
            { key: "source", header: "Source", cell: (r) => <SourceChip source={r.source} /> },
            { key: "clock", header: "Reply clock", cell: (r) => <ReplyClockChip clock={r.replyClock} /> },
            {
              key: "assignee",
              header: "Assigned",
              cell: (r) =>
                r.assignee ? (
                  <span className="flex items-center gap-2">
                    <Avatar name={r.assignee.name} seed={r.assignee.id} size={28} />
                    {r.assignee.name}
                  </span>
                ) : (
                  <span className="text-muted">Unassigned</span>
                ),
            },
            { key: "status", header: "Status", cell: (r) => <StatusBadge kind="report" status={r.status} /> },
          ]}
        />
        {data && data.total > 0 && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={(p) => update({ page: p === 1 ? null : String(p) }, { replace: false })} />}
      </section>

      {logging && (
        <PhoneReportModal
          properties={options.propertyRows}
          types={options.types}
          onClose={() => setLogging(false)}
          onDone={async (id, refNo) => {
            setLogging(false);
            toast.success(`Phone report #${refNo} logged.`);
            await queryClient.invalidateQueries({ queryKey: ["admin"] });
            openReport(id);
          }}
        />
      )}
      {naming && <SaveViewModal query={location.search.replace(/^\?/, "")} onClose={() => setNaming(false)} />}
      <Outlet />
    </>
  );
}

function delta(value: number | null, previous: number | null, unit: string, lowerIsBetter = false) {
  if (value === null || previous === null) return null;
  const d = value - previous;
  if (Math.abs(d) < 0.05) return { text: "Same as the previous period", tone: "neutral" as const };
  const better = lowerIsBetter ? d < 0 : d > 0;
  const amount = Number.isInteger(d) ? Math.abs(d) : Math.abs(d).toFixed(1);
  return { text: `${d > 0 ? "+" : "−"}${amount}${unit} vs previous period`, tone: better ? ("good" as const) : ("bad" as const) };
}

function Kpis({ summary }: { summary: ReportsSummary | undefined }) {
  if (!summary)
    return (
      <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3.5">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-[112px]" />
        ))}
      </div>
    );
  const k = summary.kpis;
  const total = k.total.value ?? 0;
  const tiles: { label: string; value: string; sub: { text: string; tone: "good" | "bad" | "neutral" } | null }[] = [
    { label: "Reports", value: String(total), sub: delta(k.total.value, k.total.previous, "") ? { ...delta(k.total.value, k.total.previous, "")!, tone: "neutral" } : null },
    { label: "Open now", value: String(k.open.value), sub: k.open.nearingDue ? { text: `${k.open.nearingDue} nearing 24 hours`, tone: "bad" } : { text: "None near 24 hours", tone: "good" } },
    { label: "Avg first reply", value: replyHours(k.avgFirstReplyHours.value), sub: k.avgFirstReplyHours.value === null ? null : k.avgFirstReplyHours.value < 24 ? { text: "Goal: under 24h", tone: "good" } : { text: "Over the 24h goal", tone: "bad" } },
    { label: "Avg time to resolve", value: k.avgResolveDays.value === null ? "—" : `${k.avgResolveDays.value.toFixed(1)}d`, sub: delta(k.avgResolveDays.value, k.avgResolveDays.previous, " days", true) },
    { label: "Top issue", value: k.topIssue ? String(k.topIssue.count) : "—", sub: k.topIssue ? { text: `${k.topIssue.label} · ${Math.round(k.topIssue.share * 100)}% of all reports`, tone: "neutral" } : null },
  ];
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3.5">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-[14px] border border-line bg-white p-4">
          <p className="m-0 text-[13px] font-semibold text-muted">{t.label}</p>
          <p className="mt-1.5 mb-0.5 font-heading text-[30px] leading-tight font-bold text-navy-ink">{t.value}</p>
          {t.sub && <p className={cx("m-0 text-[12.5px] font-bold", t.sub.tone === "good" ? "text-success" : t.sub.tone === "bad" ? "text-danger" : "text-muted")}>{t.sub.text}</p>}
        </div>
      ))}
    </div>
  );
}

function ReplyPromise({ buckets }: { buckets: ReportsSummary["replyBuckets"] }) {
  const counted = buckets.under4h + buckets.h4to12 + buckets.h12to24 + buckets.over24h;
  if (!counted || buckets.onTimePct === null) return <p className="m-0 text-muted">No replies to measure in this range yet.</p>;
  const pct = (n: number) => `${Math.round((n / counted) * 100)}%`;
  const rows: [string, number, boolean][] = [
    ["Under 4 hours", buckets.under4h, false],
    ["4 to 12 hours", buckets.h4to12, false],
    ["12 to 24 hours", buckets.h12to24, false],
    ["Over 24 hours", buckets.over24h, true],
  ];
  return (
    <div className="flex flex-wrap items-center gap-[18px]">
      <Donut percent={buckets.onTimePct} label={`${buckets.onTimePct} percent replied within 24 hours`} sub="on time" tone={buckets.onTimePct >= 90 ? "success" : buckets.onTimePct >= 75 ? "warning" : "danger"} />
      <ul className="m-0 flex min-w-[140px] flex-1 list-none flex-col gap-2 p-0 text-[13.5px]">
        {rows.map(([label, n, bad]) => (
          <li key={label} className={cx("flex justify-between gap-3", bad && n > 0 && "text-danger")}>
            <span>{label}</span>
            <strong>{pct(n)}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ByProperty({ rows, onPick }: { rows: ReportsSummary["byProperty"]; onPick: (id: string) => void }) {
  const top = Math.max(0.1, ...rows.map((r) => r.per100Units ?? 0));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] border-collapse text-[13.5px]">
        <thead>
          <tr className="text-left text-[12px] text-muted">
            {["Property", "Reports", "Per 100 units", "Avg reply", "Last 4 weeks"].map((h) => (
              <th key={h} scope="col" className="border-b border-line px-1.5 py-2 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.propertyId} className="border-b border-row-line">
              <td className="px-1.5 py-2.5">
                <button type="button" onClick={() => onPick(p.propertyId)} className="text-left hover:underline" title={`Show only ${p.name}`}>
                  <strong className="block">{p.name}</strong>
                  <span className="text-[12px] text-muted">{p.orgName}</span>
                </button>
              </td>
              <td className="px-1.5 py-2.5">{p.count}</td>
              <td className="px-1.5 py-2.5">
                {p.per100Units === null ? (
                  <span className="text-muted">No unit count</span>
                ) : (
                  <span className="flex items-center gap-2">
                    <span aria-hidden="true" className="block h-1.5 w-[60px] overflow-hidden rounded-full bg-tint-2">
                      <span className="block h-full bg-gold" style={{ width: `${(p.per100Units / top) * 100}%` }} />
                    </span>
                    {p.per100Units.toFixed(1)}
                  </span>
                )}
              </td>
              <td className="px-1.5 py-2.5">{replyHours(p.avgReplyHours)}</td>
              <td className="px-1.5 py-2.5">
                <Sparkline values={p.spark} width={70} height={22} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SaveViewModal({ query, onClose }: { query: string; onClose: () => void }) {
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const save = useMutation({
    mutationFn: () => api("/saved-views", { method: "POST", body: JSON.stringify({ page: "reports", name: name.trim(), query }) }),
    onSuccess: async () => {
      toast.success(`Saved “${name.trim()}”.`);
      await queryClient.invalidateQueries({ queryKey: ["saved-views", "reports"] });
      onClose();
    },
  });
  return (
    <Modal
      title="Save this view"
      context="Your saved views appear under the filters"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="save-view" disabled={!name.trim() || save.isPending}>
            Save view
          </Button>
        </>
      }
    >
      <form
        id="save-view"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) save.mutate();
        }}
        className="flex flex-col gap-3"
      >
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Name
          <input maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="Over 20h, no reply" className="min-h-11 rounded-lg border border-field px-3 text-base font-normal" />
        </label>
        {save.error && <Alert>{errorMessage(save.error)}</Alert>}
      </form>
    </Modal>
  );
}

/** Filter choices. Properties narrow to the organizations chosen. */
function useFilterOptions(orgIds: string[]) {
  const api = useApi();
  const orgs = useQuery({ queryKey: ["organizations"], queryFn: () => api<{ organizations: OrganizationRow[] }>("/organizations") });
  const properties = useQuery({ queryKey: ["admin", "properties"], queryFn: () => api<{ properties: AdminPropertyRow[] }>("/admin/properties") });
  const types = useQuery({ queryKey: ["admin", "issue-types"], queryFn: () => api<{ items: { key: string; label: string }[] }>("/admin/issue-types"), staleTime: 10 * 60_000 });
  const assignees = useQuery({ queryKey: ["admin", "assignees"], queryFn: () => api<{ items: { id: string; name: string }[] }>("/admin/assignees") });
  const propertyRows = properties.data?.properties ?? [];
  return {
    orgs: orgs.data?.organizations.map((o) => ({ value: o.id, label: o.name })) ?? [],
    propertyRows,
    properties: propertyRows.filter((p) => orgIds.length === 0 || (p.organizationId && orgIds.includes(p.organizationId))).map((p) => ({ value: p.id, label: p.name })),
    types: types.data?.items.map((t) => ({ value: t.key, label: t.label })) ?? [],
    assignees: assignees.data?.items.map((a) => ({ value: a.id, label: a.name })) ?? [],
  };
}
