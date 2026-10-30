import { propertyOptionLabel } from "../../../lib/propertyAddress";
import { propertyLocation } from "../../../lib/propertyAddress";
import { PropertyAddress } from "../../../components/PropertyAddress";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { errorMessage, useApi, useApiBlob, type PortalViolationList, type Resolution, type ViolationRow } from "../../../lib/api";
import { addDays, nyToday, serviceTime, whereLabel } from "../../../lib/format";
import { useQueryState } from "../../../lib/useQueryState";
import { usePortalPage } from "../../../components/admin/adminPage";
import { Tabs } from "../../../components/controls";
import { DataTable, Pagination, type Column } from "../../../components/DataTable";
import { Pill, StatusBadge } from "../../../components/display";
import { Icon } from "../../../components/icons";
import { Modal } from "../../../components/overlay";
import { ResolutionPicker } from "../../../components/portal/ResolutionPicker";
import { useRepContext } from "../../../components/portal/RepContext";
import { cx } from "../../../components/styles";
import { useToast } from "../../../components/Toast";
import { Alert, Button, ButtonLink } from "../../../components/ui";
import { ViolationThumb } from "../../violations/shared";
import { useCourtesyNotices } from "./useCourtesyNotices";

type Tab = "to_review" | "resolved" | "all";
const TABS: Tab[] = ["to_review", "resolved", "all"];
const RANGES = [
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "365", label: "Last 12 months" },
  { value: "all", label: "All time" },
] as const;
const PAGE_SIZE = 25;

const where = (r: ViolationRow) => whereLabel(r.building, r.unit);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const select = "h-10 rounded-[10px] border border-field bg-white px-2.5 text-[13.5px] font-bold text-ink focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/25";

/** "Mark resolved" for several violations at once: how they were handled, and a note when it's Other. */
function BulkResolveModal({ count, onClose, onSave }: { count: number; onClose: () => void; onSave: (r: Resolution, note: string) => Promise<void> }) {
  const [resolution, setResolution] = useState<Resolution | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!resolution) return setError("Choose how you handled them.");
    if (resolution === "other" && !note.trim()) return setError("Tell CBES what you did.");
    setSaving(true);
    try {
      await onSave(resolution, note.trim());
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };
  return (
    <Modal
      title={`Mark ${plural(count, "violation")} resolved`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Mark resolved"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <ResolutionPicker value={resolution} onChange={setResolution} name="bulk-resolution" />
        <label className="flex flex-col gap-1.5 text-[13.5px] font-semibold">
          Note for CBES {resolution === "other" ? "" : "(optional)"}
          <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} className="resize-y rounded-[10px] border border-field px-3 py-2.5 text-[14px] font-normal focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/25" />
        </label>
        <p className="m-0 text-[12.5px] text-muted">Only violations still to review change. Resolved ones stay as they are.</p>
        {error && <Alert>{error}</Alert>}
      </div>
    </Modal>
  );
}

/**
 * /portal/violations (REP_PORTAL_SPEC 7.5): what CBES sent the organization's or property's team,
 * with tabs, filters in the URL, bulk resolve, courtesy notices and CSV export.
 */
export function RepViolationsPage() {
  const api = useApi();
  const blob = useApiBlob();
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { params, update, list } = useQueryState();
  const ctx = useRepContext();
  const notices = useCourtesyNotices();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [resolving, setResolving] = useState(false);
  const [search, setSearch] = useState(params.get("q") ?? "");
  usePortalPage("Violations");

  // The URL's scope wins; otherwise the sidebar's organization or property.
  const org = params.get("org");
  const property = params.get("property");
  const scope = property ? { property } : org ? { org } : ctx.scope;
  const tab = (TABS.includes(params.get("status") as Tab) ? params.get("status") : "to_review") as Tab;
  const range = params.get("range") ?? "30";
  const page = Math.max(1, Number(params.get("page")) || 1);

  const query = new URLSearchParams({ ...(scope ?? {}), status: tab });
  if (list("type").length) query.set("type", list("type").join(","));
  if (range !== "all") query.set("from", addDays(nyToday(), -(Number(range) - 1)));
  if (params.get("q")) query.set("q", params.get("q")!);
  if (params.get("repeat") === "1") query.set("repeat", "1");
  const exportQuery = query.toString();
  query.set("page", String(page));
  query.set("pageSize", String(PAGE_SIZE));

  const key = ["portal", "violations", "list", query.toString()];
  const { data, error, isPending, isFetching, refetch } = useQuery({
    queryKey: key,
    queryFn: () => api<PortalViolationList>(`/portal/violations?${query}`),
    enabled: Boolean(scope),
    placeholderData: (prev) => prev,
  });

  // Search as you type, a moment after typing stops. Opening a violation in that moment wins: the
  // search doesn't pull the browser back to the list.
  useEffect(() => {
    const here = window.location.pathname;
    const t = setTimeout(() => {
      if (window.location.pathname !== here) return;
      if ((params.get("q") ?? "") !== search.trim()) update({ q: search.trim() || null });
    }, 300);
    return () => clearTimeout(t);
  }, [search, params, update]);

  const refresh = () =>
    Promise.all([queryClient.invalidateQueries({ queryKey: ["portal", "violations"] }), queryClient.invalidateQueries({ queryKey: ["portal", "nav-counts"] }), queryClient.invalidateQueries({ queryKey: ["rep"] })]);

  const bulk = useMutation({
    mutationFn: ({ resolution, note }: { resolution: Resolution; note: string }) =>
      api<{ changed: number; skipped: { id: string; reason: string }[] }>("/portal/violations/bulk", {
        method: "POST",
        body: JSON.stringify({ ids: [...selected], status: "resolved", resolution, note: note || undefined }),
      }),
    onSuccess: async ({ changed, skipped }) => {
      setResolving(false);
      setSelected(new Set());
      const rest = skipped.length ? ` ${skipped.length === 1 ? "1 was" : `${skipped.length} were`} already resolved or not yours to change.` : "";
      toast.success(`${plural(changed, "violation")} marked resolved.${rest}`);
      await refresh();
    },
  });

  const exportCsv = async () => {
    try {
      const file = await blob(`/portal/violations/export.csv?${exportQuery}`);
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

  const oneProperty = Boolean(scope && "property" in scope);
  // Representatives choose among the organization's properties; managers with several, among theirs.
  const propertyOptions = ctx.properties;
  const showProperty = ctx.kind === "organization" || propertyOptions.length > 1;
  const counts = data?.statusCounts;

  const columns: Column<ViolationRow>[] = [
    {
      key: "violation",
      header: "Violation",
      cell: (r) => (
        <span className="flex items-center gap-3">
          <ViolationThumb area="portal" row={r} />
          <span>
            <span className="block font-bold">{r.typeLabel}</span>
            <span className="block text-[12px] text-muted">
              V-{r.refNo} · {plural(r.photoCount, "photo")}
            </span>
          </span>
        </span>
      ),
    },
    ...(oneProperty ? [] : [{ key: "property", header: "Property", cell: (r: ViolationRow) => <span>{r.propertyName}<PropertyAddress property={propertyLocation(r)} /></span> }]),
    { key: "where", header: "Where", cell: (r) => <span className="text-muted">{where(r)}</span> },
    { key: "logged", header: "Logged", cell: (r) => <span className="whitespace-nowrap text-muted">{serviceTime(r.loggedAt)}</span> },
    {
      key: "unit30",
      header: `Unit, ${data?.items[0]?.overwatchDays ?? 30} days`,
      cell: (r) => (r.repeat ? <Pill tone="danger">{r.unitCount30d} · repeat</Pill> : <span className="text-muted">{r.unitCount30d}</span>),
    },
    { key: "status", header: "Status", cell: (r) => <StatusBadge kind="portalViolation" status={r.status as "sent" | "resolved"} /> },
    {
      key: "open",
      header: "",
      srHeader: "Open",
      className: "text-right",
      cell: (r) => (
        <Link to={`/portal/violations/${r.id}`} aria-label={`Open V-${r.refNo}`} onClick={(e) => e.stopPropagation()} className="inline-flex size-8 items-center justify-center rounded-lg border border-line text-navy hover:bg-canvas">
          <Icon name="chevron-right" size={16} strokeWidth={2.2} />
        </Link>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 flex-[1_1_420px]">
          <h1 className="m-0 text-[30px] text-navy-ink">Violations</h1>
          <p className="mt-1.5 mb-0 text-[14.5px] text-muted">Logged by CBES valets and reviewed by CBES before they reach you. Send residents a courtesy notice, then mark it resolved.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={exportCsv} disabled={!data}>
            <Icon name="download" size={18} strokeWidth={2} />
            Export CSV
          </Button>
          <ButtonLink variant="secondary" to={ctx.kind === "organization" && ctx.org ? `/portal/reporting?scope=organization&org=${ctx.org.id}` : `/portal/reporting?scope=property${scope && "property" in scope ? `&property=${scope.property}` : ""}`}>
            <Icon name="bar-chart" size={18} strokeWidth={2} />
            Reporting
          </ButtonLink>
        </div>
      </div>

      <Tabs
        variant="underline"
        label="Violation status"
        value={tab}
        onChange={(t) => {
          setSelected(new Set());
          update({ status: t === "to_review" ? null : t });
        }}
        tabs={[
          { value: "to_review", label: "To review", count: counts?.toReview },
          { value: "resolved", label: "Resolved", count: counts?.resolved },
          { value: "all", label: "All", count: counts?.all },
        ]}
      />

      <div className="flex flex-wrap items-center gap-2.5">
        {showProperty && (
          <label className="flex items-center gap-2 text-[13.5px] font-semibold text-muted">
            Property
            <select
              value={property ?? ""}
              onChange={(e) => update(e.target.value ? { property: e.target.value, org: null } : ctx.kind === "organization" && ctx.org ? { org: ctx.org.id, property: null } : { property: null })}
              className={select}
            >
              {ctx.kind === "organization" && <option value="">All {plural(propertyOptions.length, "property", "properties")}</option>}
              {propertyOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {propertyOptionLabel(p)}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex items-center gap-2 text-[13.5px] font-semibold text-muted">
          Type
          <select value={list("type")[0] ?? ""} onChange={(e) => update({ type: e.target.value || null })} className={select}>
            <option value="">All types</option>
            {(data?.types ?? []).map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-[13.5px] font-semibold text-muted">
          Dates
          <select value={range} onChange={(e) => update({ range: e.target.value === "30" ? null : e.target.value })} className={select}>
            {RANGES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex h-10 min-w-0 flex-[1_1_200px] items-center gap-2 rounded-[10px] border border-field bg-white px-3 text-[13.5px] focus-within:border-navy focus-within:ring-2 focus-within:ring-navy/25">
          <Icon name="search" size={16} strokeWidth={2} className="text-muted" />
          <span className="sr-only">Search by unit, building or violation number</span>
          <input type="search" placeholder="Unit, building or V-number" value={search} onChange={(e) => setSearch(e.target.value)} className="min-w-0 flex-1 border-0 bg-transparent outline-none" />
        </label>
        <label className="flex h-10 cursor-pointer items-center gap-2 rounded-[10px] border border-field bg-white px-3 text-[13.5px] font-semibold">
          <input type="checkbox" checked={params.get("repeat") === "1"} onChange={(e) => update({ repeat: e.target.checked ? "1" : null })} className="size-4 accent-navy" />
          Repeat units only
        </label>
      </div>

      {selected.size > 0 && (
        <div role="region" aria-label="Selected violations" className="flex flex-wrap items-center gap-3 rounded-xl bg-navy-ink px-3.5 py-2.5 text-white">
          <span className="flex-[1_1_140px] text-[14px] font-bold">{selected.size} selected</span>
          <button type="button" onClick={() => setResolving(true)} className="inline-flex h-9 items-center gap-1.5 rounded-[9px] bg-white px-3.5 text-[13px] font-bold text-navy-ink hover:bg-tint-2">
            <Icon name="check" size={15} strokeWidth={2.6} />
            Mark resolved
          </button>
          <button type="button" onClick={() => notices.download([...selected])} disabled={notices.busy} className="h-9 rounded-[9px] border border-navy-soft px-3.5 text-[13px] font-bold text-white hover:bg-white/10 disabled:opacity-60">
            {notices.busy ? "Preparing…" : "Download courtesy notices"}
          </button>
          <button type="button" onClick={() => setSelected(new Set())} className="h-9 px-2.5 text-[13px] font-bold text-nav-pill hover:text-white">
            Clear
          </button>
        </div>
      )}

      {error ? (
        <Alert>
          {errorMessage(error)}{" "}
          <Button variant="secondary" onClick={() => refetch()} disabled={isFetching} className="ml-2 min-h-9 px-3 py-1 text-[14px]">
            Retry
          </Button>
        </Alert>
      ) : (
        <section aria-label="Violations" className={cx("overflow-hidden rounded-2xl border border-line bg-white", isFetching && !isPending && "opacity-80")}>
          <DataTable
            label="Violations"
            columns={columns}
            rows={data?.items ?? []}
            rowKey={(r) => r.id}
            selectable
            selected={selected}
            onSelect={setSelected}
            onRowClick={(r) => navigate(`/portal/violations/${r.id}`)}
            rowLabel={(r) => `Select V-${r.refNo}`}
            loading={isPending}
            minWidth={oneProperty ? 760 : 900}
            empty={<p className="m-0 px-5 py-10 text-center text-[14.5px] text-muted">{tab === "to_review" ? "No violations to review." : "No violations in this range."}</p>}
          />
          {data && data.total > 0 && <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onChange={(p) => update({ page: p > 1 ? String(p) : null })} noun="violations" />}
        </section>
      )}

      <p className="m-0 flex items-center gap-2 text-[13px] text-muted">
        <Icon name="alert-circle" size={16} strokeWidth={2} />
        CBES never contacts residents about violations. Courtesy notices always come from your office.
      </p>

      {resolving && <BulkResolveModal count={selected.size} onClose={() => setResolving(false)} onSave={(resolution, note) => bulk.mutateAsync({ resolution, note }).then(() => undefined)} />}
    </div>
  );
}
