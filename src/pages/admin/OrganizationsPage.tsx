import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { errorMessage, useApi, type AdminPropertyRow, type OrganizationRow, type OrganizationStatus, type OrganizationsSummary } from "../../lib/api";
import { ORG_STATUS_LABELS, formatCount, replyHours } from "../../lib/format";
import { useFormSubmit } from "../../lib/useFormSubmit";
import { useQueryState } from "../../lib/useQueryState";
import { Alert, Button, SelectField, TextField } from "../../components/ui";
import { AvatarStack, EmptyState, PageHeader, Pill, Skeleton } from "../../components/display";
import { SegmentedControl } from "../../components/controls";
import { SearchField } from "../../components/FilterBar";
import { DataTable } from "../../components/DataTable";
import { Modal } from "../../components/overlay";
import { OrgLogo } from "../../components/brand";
import { orgColor } from "../../components/displayUtils";
import { Icon, type IconName } from "../../components/icons";
import { useToast } from "../../components/Toast";
import { useAdminPage } from "../../components/admin/adminPage";
import { cx } from "../../components/styles";
import { OrganizationView } from "../org/OrganizationView";
import { propertyPath } from "./paths";

const STATUS_TONE = { active: "success", onboarding: "warning", inactive: "neutral" } as const;

export function OrgStatusPill({ status }: { status: OrganizationStatus }) {
  return <Pill tone={STATUS_TONE[status]}>{ORG_STATUS_LABELS[status]}</Pill>;
}

type Sort = "properties" | "name" | "open" | "newest";
const SORTS: Record<Sort, { label: string; compare: (a: OrganizationRow, b: OrganizationRow) => number }> = {
  properties: { label: "Most properties", compare: (a, b) => b.properties - a.properties || a.name.localeCompare(b.name) },
  name: { label: "Name A–Z", compare: (a, b) => a.name.localeCompare(b.name) },
  open: { label: "Most open items", compare: (a, b) => b.openReports + b.pendingInvitations - (a.openReports + a.pendingInvitations) || a.name.localeCompare(b.name) },
  newest: { label: "Newest", compare: (a, b) => b.createdAt.localeCompare(a.createdAt) },
};

const VIEW_KEY = "cbes-admin:organizations-view";
const savedView = () => {
  try {
    return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "tiles";
  } catch {
    return "tiles";
  }
};

const repText = (reps: OrganizationRow["representatives"], pending: number) =>
  reps.length === 0 ? (pending ? "Invite pending" : "No Representative yet") : reps.length === 1 ? reps[0].name : `${reps[0].name} + ${reps.length - 1}`;

/** /admin/organizations: every management company, as tiles or a list. */
export function OrganizationsPage() {
  const api = useApi();
  const { params, update } = useQueryState();
  const [creating, setCreating] = useState(false);
  useAdminPage("Organizations");

  const list = useQuery({ queryKey: ["organizations"], queryFn: () => api<{ organizations: OrganizationRow[] }>("/organizations") });
  const summary = useQuery({ queryKey: ["admin", "organizations", "summary"], queryFn: () => api<OrganizationsSummary>("/admin/organizations/summary") });

  const q = params.get("q") ?? "";
  const status = (params.get("status") ?? "active") as OrganizationStatus | "all";
  const sort = (params.get("sort") ?? "properties") as Sort;
  const view = (params.get("view") ?? savedView()) as "tiles" | "list";
  const setView = (v: "tiles" | "list") => {
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // Only a convenience: the query string still holds the view.
    }
    update({ view: v });
  };

  const needle = q.trim().toLowerCase();
  const rows = (list.data?.organizations ?? [])
    .filter((o) => status === "all" || o.status === status)
    .filter((o) => !needle || o.name.toLowerCase().includes(needle) || o.representatives.some((r) => r.name.toLowerCase().includes(needle)))
    .sort((SORTS[sort] ?? SORTS.properties).compare);

  return (
    <>
      <PageHeader
        title="Organizations"
        description="The management companies CBES works with. Every property belongs to an organization. Representatives run their organization and can add up to 100 properties."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Icon name="plus" size={18} strokeWidth={2.2} />
            New organization
          </Button>
        }
      />

      <Stats summary={summary.data} />
      <UnassignedProperties />

      <div className="flex flex-wrap items-center gap-2.5">
        <SearchField label="Search organizations" placeholder="Search organizations or Representatives" value={q} onChange={(v) => update({ q: v })} />
        <label className="flex items-center gap-2 text-[13px] font-semibold">
          Status
          <select value={status} onChange={(e) => update({ status: e.target.value === "active" ? null : e.target.value })} className="h-[38px] rounded-[10px] border border-field bg-white px-2.5 text-[13px]">
            {(["active", "onboarding", "inactive"] as const).map((s) => (
              <option key={s} value={s}>
                {ORG_STATUS_LABELS[s]}
              </option>
            ))}
            <option value="all">All</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-[13px] font-semibold">
          Sort
          <select value={sort} onChange={(e) => update({ sort: e.target.value === "properties" ? null : e.target.value })} className="h-[38px] rounded-[10px] border border-field bg-white px-2.5 text-[13px]">
            {(Object.keys(SORTS) as Sort[]).map((s) => (
              <option key={s} value={s}>
                {SORTS[s].label}
              </option>
            ))}
          </select>
        </label>
        <SegmentedControl
          label="Layout"
          value={view}
          onChange={setView}
          options={[
            { value: "tiles", label: "Tiles", icon: "photo-grid" },
            { value: "list", label: "List", icon: "list" },
          ]}
        />
      </div>

      {list.error && <Alert>{errorMessage(list.error)}</Alert>}
      {list.isPending && <TileSkeleton />}
      {list.data &&
        (rows.length === 0 ? (
          <section className="rounded-[14px] border border-line bg-white">
            {list.data.organizations.length === 0 ? (
              <EmptyState icon="building" title="No organizations yet" body="Add the first management company, then its properties and Representatives." action={<Button onClick={() => setCreating(true)}>New organization</Button>} />
            ) : (
              <EmptyState icon="search" title="No organizations match" body="Try another name, or set Status to All." />
            )}
          </section>
        ) : view === "list" ? (
          <OrganizationList rows={rows} />
        ) : (
          <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(330px,100%),1fr))] gap-[18px] p-0">
            {rows.map((o) => (
              <li key={o.id}>
                <OrganizationTile org={o} />
              </li>
            ))}
          </ul>
        ))}

      {creating && <NewOrganizationModal onClose={() => setCreating(false)} />}
    </>
  );
}

function Stats({ summary }: { summary: OrganizationsSummary | undefined }) {
  const items: [string, number | undefined, IconName][] = [
    ["Organizations", summary?.organizations, "building"],
    ["Properties", summary?.properties, "home"],
    ["Units under service", summary?.units, "photo-grid"],
    ["Representatives", summary?.representatives, "users"],
    ["Pending invitations", summary?.pendingInvitations, "mail"],
  ];
  return (
    <ul aria-label="Totals" className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3.5 p-0">
      {items.map(([label, value, icon]) => (
        <li key={label} className="flex items-center gap-3 rounded-[14px] border border-line bg-white p-4">
          <span className="flex size-10 flex-none items-center justify-center rounded-[11px] bg-tint-2 text-navy">
            <Icon name={icon} strokeWidth={2} />
          </span>
          <span>
            <span className="block font-heading text-2xl leading-tight font-bold text-navy-ink">{value === undefined ? <Skeleton className="my-1 h-6 w-10" /> : formatCount(value)}</span>
            <span className="block text-[12.5px] text-muted">{label}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function Meter({ value, max, className }: { value: number; max: number; className?: string }) {
  return (
    <span aria-hidden="true" className={cx("block overflow-hidden rounded-full bg-tint-2", className)}>
      <span className="block h-full rounded-full bg-navy" style={{ width: `${Math.max(2, Math.min(100, (value / Math.max(1, max)) * 100))}%` }} />
    </span>
  );
}

function OrganizationTile({ org }: { org: OrganizationRow }) {
  const mini: [string, string][] = [
    ["Open reports", String(org.openReports)],
    ["Violations 30d", org.violations30d === null ? "—" : String(org.violations30d)],
    ["Avg reply", replyHours(org.avgReplyHours)],
  ];
  return (
    <Link to={`/admin/organizations/${org.id}`} className="flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-white text-ink no-underline hover:border-navy/40 hover:text-ink">
      <span aria-hidden="true" className="block h-16 opacity-90" style={{ background: orgColor(org.id) }} />
      <span className="flex flex-1 flex-col gap-3.5 px-5 pb-5">
        <span className="relative -mt-7 flex items-end justify-between">
          <OrgLogo org={org} size={56} className="border-[3px] border-white shadow-[0_2px_6px_rgba(26,28,94,0.18)]" />
          <OrgStatusPill status={org.status} />
        </span>
        <span>
          <span className="block font-heading text-[19px] font-bold">{org.name}</span>
          <span className="mt-0.5 block text-[13px] text-muted">{org.serviceArea ?? "No service area yet"}</span>
        </span>
        <span>
          <span className="mb-1.5 flex justify-between text-[12.5px]">
            <span className="font-bold">
              {org.properties} of {org.propertyLimit} properties
            </span>
            <span className="text-muted">{formatCount(org.units)} units</span>
          </span>
          <Meter value={org.properties} max={org.propertyLimit} className="h-2" />
        </span>
        <span className="grid grid-cols-3 gap-2 text-center">
          {mini.map(([label, value]) => (
            <span key={label} className="rounded-[10px] bg-subtle px-1 py-2">
              <span className="block font-heading text-lg font-bold text-navy-ink">{value}</span>
              <span className="text-[11.5px] text-muted">{label}</span>
            </span>
          ))}
        </span>
        <span className="mt-auto flex items-center justify-between gap-2 border-t border-row-line pt-3">
          <span className="flex min-w-0 items-center gap-2">
            {org.representatives.length > 0 && <AvatarStack people={org.representatives} max={3} />}
            <span className="truncate text-[12.5px] text-muted">{repText(org.representatives, org.pendingInvitations)}</span>
          </span>
          <span className="flex flex-none items-center gap-1 text-[13px] font-bold text-navy">
            Open
            <Icon name="chevron-right" size={14} strokeWidth={2.4} />
          </span>
        </span>
      </span>
    </Link>
  );
}

function OrganizationList({ rows }: { rows: OrganizationRow[] }) {
  const navigate = useNavigate();
  return (
    <section className="overflow-hidden rounded-[14px] border border-line bg-white">
      <DataTable
        label="Organizations"
        rows={rows}
        rowKey={(o) => o.id}
        onRowClick={(o) => navigate(`/admin/organizations/${o.id}`)}
        minWidth={980}
        empty={null}
        columns={[
          {
            key: "name",
            header: "Organization",
            cell: (o) => (
              <span className="flex items-center gap-3">
                <OrgLogo org={o} size={36} />
                <span>
                  <Link to={`/admin/organizations/${o.id}`} className="font-bold text-ink no-underline hover:underline">
                    {o.name}
                  </Link>
                  <span className="block text-[12px] text-muted">{o.serviceArea}</span>
                </span>
              </span>
            ),
          },
          { key: "status", header: "Status", cell: (o) => <OrgStatusPill status={o.status} /> },
          {
            key: "properties",
            header: "Properties",
            cell: (o) => (
              <span className="flex items-center gap-2">
                <Meter value={o.properties} max={o.propertyLimit} className="h-1.5 w-14" />
                {o.properties}/{o.propertyLimit}
              </span>
            ),
          },
          { key: "units", header: "Units", cell: (o) => formatCount(o.units) },
          { key: "reps", header: "Representatives", cell: (o) => (o.representatives.length ? <AvatarStack people={o.representatives} max={3} /> : <span className="text-muted">None</span>) },
          { key: "open", header: "Open reports", cell: (o) => o.openReports },
          { key: "violations", header: "Violations 30d", cell: (o) => o.violations30d ?? "—" },
          { key: "reply", header: "Avg reply", cell: (o) => replyHours(o.avgReplyHours) },
          {
            key: "go",
            header: "",
            srHeader: "Open",
            cell: (o) => (
              <Link to={`/admin/organizations/${o.id}`} aria-label={`Open ${o.name}`} className="flex size-[34px] items-center justify-center rounded-[9px] border border-line text-ink hover:bg-canvas">
                <Icon name="chevron-right" size={16} strokeWidth={2.2} />
              </Link>
            ),
          },
        ]}
      />
    </section>
  );
}

function TileSkeleton() {
  return (
    <div role="status" aria-label="Loading organizations" className="grid grid-cols-[repeat(auto-fill,minmax(min(330px,100%),1fr))] gap-[18px]">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-5">
          <Skeleton className="h-14 w-14" />
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ))}
    </div>
  );
}

/** Admins only: the API refuses everyone else. */
function NewOrganizationModal({ onClose }: { onClose: () => void }) {
  const api = useApi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { onSubmit, errors, formError, saving } = useFormSubmit(
    (v) =>
      api<{ organization: { id: string; name: string } }>("/organizations", {
        method: "POST",
        body: JSON.stringify({ name: v.get("name"), serviceArea: v.get("serviceArea"), status: v.get("status") }),
      }),
    async ({ organization }, v) => {
      const email = String(v.get("repEmail") ?? "").trim();
      let invited = false;
      if (email) {
        try {
          await api(`/organizations/${organization.id}/invitations`, {
            method: "POST",
            body: JSON.stringify({ email, name: v.get("repName"), role: "representative", propertyIds: [] }),
          });
          invited = true;
        } catch (err) {
          toast.error(`${organization.name} was added, but the invitation to ${email} wasn't sent: ${errorMessage(err)}`);
        }
      }
      await queryClient.invalidateQueries({ queryKey: ["organizations"] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "organizations", "summary"] });
      if (!email || invited) toast.success(invited ? `${organization.name} added. Invitation sent to ${email}.` : `${organization.name} added.`);
      navigate(`/admin/organizations/${organization.id}`);
    },
  );

  return (
    <Modal
      title="New organization"
      context="Only CBES admins add organizations"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="new-org" disabled={saving}>
            {saving ? "Adding…" : "Add organization"}
          </Button>
        </>
      }
    >
      <form id="new-org" onSubmit={onSubmit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField label="Organization name" name="name" required autoComplete="organization" error={errors.name} className="sm:col-span-2" />
        <TextField label="Service area" name="serviceArea" optional hint="Cities they manage in, such as Decatur, Brookhaven" error={errors.serviceArea} />
        <SelectField label="Status" name="status" defaultValue="onboarding" error={errors.status}>
          {(["onboarding", "active", "inactive"] as const).map((s) => (
            <option key={s} value={s}>
              {ORG_STATUS_LABELS[s]}
            </option>
          ))}
        </SelectField>
        <fieldset className="m-0 grid grid-cols-1 gap-4 rounded-xl border border-line p-4 sm:col-span-2 sm:grid-cols-2">
          <legend className="px-1 text-sm font-semibold">Invite a Representative now (optional)</legend>
          <TextField label="Email" name="repEmail" type="email" autoComplete="off" optional />
          <TextField label="Name" name="repName" autoComplete="off" optional />
        </fieldset>
        <p className="m-0 text-[13px] text-muted sm:col-span-2">Add the logo from the organization's page once it's created.</p>
        {formError && (
          <div className="sm:col-span-2">
            <Alert>{formError}</Alert>
          </div>
        )}
      </form>
    </Modal>
  );
}

/**
 * Properties left without an organization from before Organizations existed. Each one is moved
 * from its own page (Settings, then Organization). Shown until none are left.
 */
function UnassignedProperties() {
  const api = useApi();
  const [params] = useSearchParams();
  const { data } = useQuery({
    queryKey: ["admin", "properties"],
    queryFn: () => api<{ properties: AdminPropertyRow[] }>("/admin/properties"),
  });
  const unassigned = data?.properties.filter((p) => !p.organizationId) ?? [];
  if (unassigned.length === 0) return null;
  const n = unassigned.length;
  return (
    <section aria-labelledby="unassigned-title" className={cx("rounded-[14px] border bg-warning-bg p-5", params.get("unassigned") ? "border-warning" : "border-warning/30")}>
      <h2 id="unassigned-title" className="m-0 flex items-center gap-2 text-lg text-warning">
        <Icon name="alert-triangle" />
        {n} {n === 1 ? "property isn't" : "properties aren't"} in an organization yet
      </h2>
      <p className="mt-1 mb-3 text-[14.5px] text-ink">Open each one and choose its organization under Settings. New properties are always added from an organization.</p>
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
        {unassigned.map((p) => (
          <li key={p.id}>
            <Link to={`${propertyPath(null, p.id)}?tab=settings`} className="inline-flex min-h-10 items-center gap-1.5 rounded-[10px] border border-field bg-white px-3 text-[14px] font-semibold text-ink no-underline hover:bg-canvas hover:text-ink">
              Move {p.name}
              {p.city && <span className="font-normal text-muted">{p.city}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function OrganizationAdminPage() {
  const { orgId = "" } = useParams();
  return <OrganizationView id={orgId} area="admin" isAdmin />;
}
