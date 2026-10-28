import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  errorMessage,
  useApi,
  useApiBlob,
  type AdminPropertyRow,
  type AdminViolationList,
  type OrganizationRow,
  type StaffOption,
  type ViolationRow,
  type ViolationStatus,
  type ViolationType,
} from "../../lib/api";
import { nyToday, serviceTime } from "../../lib/format";
import { DATE_PRESETS, dateRange } from "../../lib/dates";
import { useQueryState } from "../../lib/useQueryState";
import { Alert, Button } from "../../components/ui";
import { Avatar, EmptyState, PageHeader, StatusBadge } from "../../components/display";
import { SegmentedControl } from "../../components/controls";
import { FilterBar, SearchField, type FilterDef, type FilterValue } from "../../components/FilterBar";
import { DataTable, Pagination } from "../../components/DataTable";
import { Icon } from "../../components/icons";
import { useToast } from "../../components/Toast";
import { useAdminPage } from "../../components/admin/adminPage";
import { cx } from "../../components/styles";
import { DismissModal, UnitHistory, ViolationThumb } from "./shared";

const STAGES: { value: ViolationStatus; label: string; sub: string; dot: string }[] = [
  { value: "new", label: "New", sub: "Logged since last review", dot: "bg-[#8a8ca3]" },
  { value: "in_review", label: "In review", sub: "Being checked by CBES", dot: "bg-[#d99a1e]" },
  { value: "sent", label: "Sent to property", sub: "Waiting on the property", dot: "bg-[#3b7be0]" },
  { value: "resolved", label: "Resolved", sub: "Closed by the property or CBES", dot: "bg-success" },
  { value: "dismissed", label: "Dismissed", sub: "Not a violation", dot: "bg-placeholder" },
];

const FILTER_KEYS = ["org", "property", "type", "steward", "dates"] as const;
const PAGE_SIZE = 25;

/** /admin/violations: review what valets logged and move it to the property (ADMIN_PORTAL_SPEC 7.4). */
export function ViolationsPage() {
  const api = useApi();
  const blob = useApiBlob();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { params, update, list } = useQueryState();
  // A selection belongs to the list it was made on (see `selected` below).
  const [selection, setSelection] = useState<{ list: string; ids: Set<string> }>({ list: "", ids: new Set() });
  const [dismissing, setDismissing] = useState<string[] | null>(null);
  useAdminPage("Violations");

  const stage = (params.get("stage") ?? "new") as ViolationStatus | "all";
  const view = params.get("view") === "grid" ? "grid" : "list";
  const page = Math.max(1, Number(params.get("page") ?? 1) || 1);
  const q = params.get("q") ?? "";
  const filters: FilterValue = Object.fromEntries(FILTER_KEYS.map((k) => [k, list(k)]));

  const query = new URLSearchParams();
  if (stage !== "all") query.set("stage", stage);
  for (const k of ["org", "property", "type", "steward"] as const) if (filters[k]?.length) query.set(k, filters[k]!.join(","));
  const { from, to } = dateRange(filters.dates ?? []);
  if (from) query.set("from", from);
  if (to) query.set("to", to);
  if (q.trim()) query.set("q", q.trim());
  const filterQuery = query.toString();
  const sendQuery = new URLSearchParams(filterQuery);
  sendQuery.delete("stage");
  const filterSend = sendQuery.toString();
  query.set("page", String(page));
  query.set("pageSize", String(PAGE_SIZE));

  const listKey = query.toString();
  const violations = useQuery({
    queryKey: ["admin", "violations", listKey],
    queryFn: () => api<AdminViolationList>(`/admin/violations?${listKey}`),
    placeholderData: (prev) => prev,
  });
  // Bulk actions only ever reach violations on screen now: changing a filter, the stage or the page
  // clears the selection, and rows that leave the list drop out of it.
  const shown = new Set(violations.isPlaceholderData ? [] : (violations.data?.items ?? []).map((v) => v.id));
  const selected = selection.list === listKey ? new Set([...selection.ids].filter((id) => shown.has(id))) : new Set<string>();
  const setSelected = (ids: Set<string>) => setSelection({ list: listKey, ids });
  const options = useFilterOptions();

  const refresh = async () => {
    setSelected(new Set());
    await queryClient.invalidateQueries({ queryKey: ["admin"] });
  };
  const bulk = useMutation({
    mutationFn: (body: { ids: string[]; status: ViolationStatus; reason?: string }) => api<{ updated: number }>("/admin/violations/bulk", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: async ({ updated }, { status }) => {
      toast.success(`${updated} violation${updated === 1 ? "" : "s"} ${status === "in_review" ? "marked in review" : status === "sent" ? "sent to the property" : "dismissed"}.`);
      await refresh();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const send = useMutation({
    // Sends the In review violations matching the current filters, so it sends what the button counts.
    mutationFn: () => api<{ sent: number; properties: number }>(`/admin/violations/send${filterSend ? `?${filterSend}` : ""}`, { method: "POST", body: "{}" }),
    onSuccess: async ({ sent, properties }) => {
      toast.success(
        properties
          ? `Sent ${sent} violation${sent === 1 ? "" : "s"} to ${properties} propert${properties === 1 ? "y" : "ies"}.`
          : `Moved ${sent} violation${sent === 1 ? "" : "s"} to Sent. No property managers were set up to email.`,
      );
      await refresh();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const exportCsv = async () => {
    try {
      const file = await blob(`/admin/violations/export.csv?${filterQuery}`);
      if (!file) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(file);
      a.download = `violations-${nyToday()}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const data = violations.data;
  const reviewed = data?.stageCounts.in_review ?? 0;
  const open = (id: string) => navigate(`/admin/violations/${id}`, { state: { back: location.search } });
  const filterDefs: FilterDef[] = [
    { key: "org", label: "Org", icon: "building", type: "multi", options: options.orgs },
    { key: "property", label: "Property", icon: "home", type: "multi", options: options.properties },
    { key: "type", label: "Type", type: "multi", options: options.types },
    { key: "steward", label: "Steward", type: "multi", options: options.stewards, allLabel: "Anyone" },
    { key: "dates", label: "Dates", icon: "calendar", type: "date", presets: DATE_PRESETS, allLabel: "Any time" },
  ];
  const ids = [...selected];

  return (
    <>
      <PageHeader
        title="Violations"
        description="Logged by valets with a photo, time and GPS. Reviewed by CBES, then shared with the property. Residents are never contacted."
        actions={
          <>
            <Button variant="secondary" onClick={exportCsv}>
              <Icon name="download" size={18} strokeWidth={2} />
              Export
            </Button>
            <Button disabled={reviewed === 0 || send.isPending} onClick={() => send.mutate()}>
              <Icon name="send" size={18} strokeWidth={2} />
              {send.isPending ? "Sending…" : `Send reviewed to properties (${reviewed})`}
            </Button>
          </>
        }
      />

      <div role="group" aria-label="Stage" className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
        {STAGES.map((s) => {
          const on = stage === s.value;
          return (
            <button
              key={s.value}
              type="button"
              aria-pressed={on}
              onClick={() => update({ stage: on ? "all" : s.value === "new" ? null : s.value })}
              className={cx(
                "flex flex-col gap-1 rounded-[14px] bg-white px-4 py-3.5 text-left text-ink",
                on ? "border-2 border-navy shadow-[0_4px_14px_rgba(39,43,132,0.12)]" : "border border-line hover:border-navy/40",
              )}
            >
              <span className="flex items-center gap-2 text-[13px] font-bold">
                <span aria-hidden="true" className={cx("size-[9px] rounded-full", s.dot)} />
                {s.label}
              </span>
              <span className="font-heading text-[28px] leading-tight font-bold text-navy-ink">{data ? data.stageCounts[s.value] : "—"}</span>
              <span className="text-[12px] text-muted">{s.sub}</span>
            </button>
          );
        })}
      </div>

      <section className="overflow-hidden rounded-[14px] border border-line bg-white">
        <div className="border-b border-line px-4 py-3.5">
          <FilterBar
            filters={filterDefs}
            value={filters}
            onChange={(v) => update(Object.fromEntries(FILTER_KEYS.map((k) => [k, v[k] ?? null])))}
            search={<SearchField label="Search violations" placeholder="Unit, ticket number or valet" value={q} onChange={(v) => update({ q: v })} />}
            end={
              <SegmentedControl
                size="sm"
                label="Layout"
                value={view}
                onChange={(v) => update({ view: v === "list" ? null : v, page: params.get("page") })}
                options={[
                  { value: "list", label: "List view", icon: "list" },
                  { value: "grid", label: "Photo grid view", icon: "photo-grid" },
                ]}
              />
            }
          />
        </div>

        {selected.size > 0 && (
          <div role="region" aria-label="Selected violations" className="flex flex-wrap items-center gap-2 border-b border-line bg-tint-2 px-4 py-2.5">
            <span className="mr-2 text-[14px] font-bold">{selected.size} selected</span>
            <Button variant="secondary" className="min-h-9! px-3! text-[13px]" disabled={bulk.isPending} onClick={() => bulk.mutate({ ids, status: "in_review" })}>
              Mark in review
            </Button>
            <Button variant="secondary" className="min-h-9! px-3! text-[13px]" disabled={bulk.isPending} onClick={() => bulk.mutate({ ids, status: "sent" })}>
              Send to property
            </Button>
            <Button variant="secondary" className="min-h-9! px-3! text-[13px]" disabled={bulk.isPending} onClick={() => setDismissing(ids)}>
              Dismiss
            </Button>
            <button type="button" onClick={() => setSelected(new Set())} className="ml-auto text-[13px] font-bold text-navy hover:underline">
              Clear selection
            </button>
          </div>
        )}

        {violations.error && (
          <div className="p-4">
            <Alert>{errorMessage(violations.error)}</Alert>
          </div>
        )}

        {view === "list" ? (
          <DataTable
            label="Violations"
            rows={data?.items ?? []}
            loading={violations.isPending}
            rowKey={(r) => r.id}
            selectable
            selected={selected}
            onSelect={setSelected}
            onRowClick={(r) => open(r.id)}
            minWidth={1080}
            empty={<Empty stage={stage} />}
            columns={[
              {
                key: "violation",
                header: "Violation",
                cell: (r) => (
                  <span className="flex items-center gap-3">
                    <ViolationThumb area="admin" row={r} />
                    <span>
                      <Link to={`/admin/violations/${r.id}`} state={{ back: location.search }} className="block font-bold text-ink no-underline hover:underline">
                        {r.typeLabel}
                      </Link>
                      <span className="text-[12px] text-muted">
                        V-{r.refNo} · {serviceTime(r.loggedAt)}
                      </span>
                    </span>
                  </span>
                ),
              },
              {
                key: "property",
                header: "Property · Unit",
                cell: (r) => (
                  <>
                    <span className="block font-semibold">{r.propertyName}</span>
                    <span className="text-[12px] text-muted">{[r.orgName, r.building && `Bldg ${r.building}`, r.unit].filter(Boolean).join(" · ")}</span>
                  </>
                ),
              },
              {
                key: "valet",
                header: "Logged by",
                cell: (r) => (
                  <span className="flex items-center gap-2">
                    <Avatar name={r.valet.name} seed={r.valet.id} size={30} />
                    <span>
                      <span className="block font-semibold">{r.valet.name}</span>
                      <span className="text-[12px] text-muted">Valet</span>
                    </span>
                  </span>
                ),
              },
              {
                key: "steward",
                header: "Steward",
                cell: (r) =>
                  r.steward ? (
                    <span className="flex items-center gap-2">
                      <Avatar name={r.steward.name} seed={r.steward.id} size={30} />
                      {r.steward.name}
                    </span>
                  ) : (
                    <span className="text-muted">None</span>
                  ),
              },
              { key: "history", header: "Unit history", cell: (r) => <UnitHistory row={r} /> },
              {
                key: "notes",
                header: "Notes",
                cell: (r) => (
                  <span className="inline-flex items-center gap-1.5 font-semibold text-muted">
                    <Icon name="message" size={16} strokeWidth={2} />
                    {r.notesCount}
                    <span className="sr-only">notes</span>
                  </span>
                ),
              },
              { key: "status", header: "Status", cell: (r) => <StatusBadge kind="violation" status={r.status} /> },
              {
                key: "open",
                header: "",
                srHeader: "Open",
                cell: (r) => (
                  <Link to={`/admin/violations/${r.id}`} state={{ back: location.search }} aria-label={`Open V-${r.refNo}`} className="flex size-[34px] items-center justify-center rounded-[9px] border border-line text-ink hover:bg-canvas">
                    <Icon name="chevron-right" size={16} strokeWidth={2.2} />
                  </Link>
                ),
              },
            ]}
          />
        ) : (
          <PhotoGrid rows={data?.items ?? []} loading={violations.isPending} stage={stage} back={location.search} />
        )}

        {data && data.total > 0 && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={(p) => update({ page: p === 1 ? null : String(p) }, { replace: false })} />}
      </section>

      {dismissing && (
        <DismissModal
          count={dismissing.length}
          onClose={() => setDismissing(null)}
          onDismiss={async (reason) => {
            await bulk.mutateAsync({ ids: dismissing, status: "dismissed", reason });
            setDismissing(null);
          }}
        />
      )}
    </>
  );
}

function Empty({ stage }: { stage: ViolationStatus | "all" }) {
  const label = STAGES.find((s) => s.value === stage)?.label;
  return (
    <EmptyState
      icon="alert-triangle"
      title={label ? `No ${label.toLowerCase()} violations` : "No violations"}
      body={stage === "new" ? "Nothing new from the valets. New violations show here as they sync." : "Nothing matches these filters. Clear a filter or pick another stage."}
    />
  );
}

function PhotoGrid({ rows, loading, stage, back }: { rows: ViolationRow[]; loading: boolean; stage: ViolationStatus | "all"; back: string }) {
  if (loading) return <p role="status" className="m-0 px-4 py-12 text-center text-muted">Loading…</p>;
  if (rows.length === 0) return <Empty stage={stage} />;
  return (
    <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3 p-4">
      {rows.map((r) => (
        <li key={r.id}>
          <Link to={`/admin/violations/${r.id}`} state={{ back }} className="flex h-full flex-col overflow-hidden rounded-xl border border-line text-ink no-underline hover:border-navy/40 hover:text-ink">
            <ViolationThumb area="admin" row={r} fill />
            <span className="flex flex-1 flex-col gap-1 p-2.5">
              <strong className="text-[13.5px]">{r.typeLabel}</strong>
              <span className="text-[12px] text-muted">
                Unit {r.unit} · {r.propertyName}
              </span>
              <span className="mt-auto pt-1">
                <StatusBadge kind="violation" status={r.status} />
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Choices for the filter buttons, from lists the admin pages already load. */
function useFilterOptions() {
  const api = useApi();
  const orgs = useQuery({ queryKey: ["organizations"], queryFn: () => api<{ organizations: OrganizationRow[] }>("/organizations") });
  const properties = useQuery({ queryKey: ["admin", "properties"], queryFn: () => api<{ properties: AdminPropertyRow[] }>("/admin/properties") });
  const types = useQuery({ queryKey: ["admin", "violation-types"], queryFn: () => api<{ items: ViolationType[] }>("/admin/violation-types"), staleTime: 10 * 60_000 });
  const stewards = useQuery({ queryKey: ["admin", "stewards"], queryFn: () => api<{ items: StaffOption[] }>("/admin/stewards") });
  return {
    orgs: orgs.data?.organizations.map((o) => ({ value: o.id, label: o.name })) ?? [],
    properties: properties.data?.properties.map((p) => ({ value: p.id, label: p.name })) ?? [],
    types: types.data?.items.map((t) => ({ value: t.key, label: t.label })) ?? [],
    stewards: stewards.data?.items.map((s) => ({ value: s.id, label: s.name })) ?? [],
  };
}
