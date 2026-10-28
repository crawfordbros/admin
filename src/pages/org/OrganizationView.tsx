import { Suspense, lazy, useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Outlet } from "react-router-dom";
import { errorMessage, useApi, type InviteRole, type OrganizationDetail, type OrganizationProperty } from "../../lib/api";
import { CONTRACT_LABELS, INVITE_ROLE_LABELS, ORG_STATUS_LABELS, PROPERTY_ROLE_LABELS, age, formatCount, monthYear, replyHours, timeAgo } from "../../lib/format";
import { IMAGE_TYPES, MAX_IMAGE_BYTES, squareWebp } from "../../lib/images";
import { useFormSubmit } from "../../lib/useFormSubmit";
import { useQueryState } from "../../lib/useQueryState";
import { Alert, Button, ButtonLink, Loading, SelectField, TextField } from "../../components/ui";
import { Avatar, EmptyState, Pill, StatTile } from "../../components/display";
import { Tabs } from "../../components/controls";
import { Modal } from "../../components/overlay";
import { OrgLogo, PropertyPhoto } from "../../components/brand";
import { orgColor } from "../../components/displayUtils";
import { Icon } from "../../components/icons";
import { useToast } from "../../components/Toast";
import { useAdminPage } from "../../components/admin/adminPage";
import { cx } from "../../components/styles";
import { propertyPath } from "../admin/paths";
// Admin-only tabs, loaded when opened so Representatives' pages stay small.
const ScopedReports = lazy(() => import("../admin/scoped").then((m) => ({ default: m.ScopedReports })));
const ScopedViolations = lazy(() => import("../admin/scoped").then((m) => ({ default: m.ScopedViolations })));
const OrgActivity = lazy(() => import("../admin/scoped").then((m) => ({ default: m.OrgActivity })));
import type { OrgOutletContext } from "./AddPropertyModal";

type Props = {
  id: string;
  /** Where links go: the Admin Portal pages or the portal's. */
  area: "admin" | "portal";
  /** Admins also set the status, add or remove representatives, and see CBES-only details. */
  isAdmin: boolean;
};

type Tab = "properties" | "people" | "invitations" | "reports" | "violations" | "activity";

/**
 * One organization: its properties, people and pending invitations (ADMIN_PORTAL_SPEC 7.8). CBES
 * admins and the organization's representatives share it; the Add property form opens over it
 * (the child route renders into the Outlet).
 */
export function OrganizationView({ id, area, isAdmin }: Props) {
  const api = useApi();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { params, update } = useQueryState();
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<{ question: string; path: string; message: string } | null>(null);
  const key = ["organization", id];
  const { data, error, isPending } = useQuery({ queryKey: key, queryFn: () => api<OrganizationDetail>(`/organizations/${id}`) });

  const name = data?.organization.name;
  useEffect(() => {
    if (name && area === "portal") document.title = `${name} | CBES Portal`;
  }, [name, area]);
  useAdminPage(area === "admin" ? (name ?? null) : null, area === "admin" && name ? [{ label: "Organizations", to: "/admin/organizations" }, { label: name }] : undefined);

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: key }),
      queryClient.invalidateQueries({ queryKey: ["organizations"] }),
      queryClient.invalidateQueries({ queryKey: ["admin"] }),
      queryClient.invalidateQueries({ queryKey: ["me"] }),
    ]);

  const remove = useMutation({
    mutationFn: ({ path }: { path: string; message: string }) => api(path, { method: "DELETE" }),
    onSuccess: async (_res, { message }) => {
      setConfirm(null);
      toast.success(message);
      await refresh();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (isPending) return <Loading />;
  if (error) return <Alert>{errorMessage(error)}</Alert>;

  const { organization, kpis, properties, representatives, staff, invitations } = data;
  const base = `/organizations/${organization.id}`;
  const propertyLink = (propertyId: string) => (area === "admin" ? propertyPath(organization.id, propertyId) : `/portal/properties/${propertyId}`);
  const slots = Math.max(0, organization.propertyLimit - properties.length);
  const people = new Set([...representatives.map((r) => r.id), ...staff.map((s) => s.id)]).size;
  // Reports, Violations and Activity read admin-only endpoints; Representatives see them per property.
  const tabs: Tab[] = area === "admin" ? ["properties", "people", "invitations", "reports", "violations", "activity"] : ["properties", "people", "invitations"];
  const tab = (tabs.includes(params.get("tab") as Tab) ? params.get("tab") : "properties") as Tab;

  return (
    <div className="flex flex-col gap-5">
      {area === "admin" && (
        <Link to="/admin/organizations" className="inline-flex items-center gap-1.5 self-start text-[14px] font-bold no-underline">
          <Icon name="chevron-left" size={16} strokeWidth={2.2} />
          All organizations
        </Link>
      )}

      <section className="overflow-hidden rounded-2xl border border-line bg-white">
        <div aria-hidden="true" className="h-[88px]" style={{ background: orgColor(organization.id) }} />
        <div className="flex flex-wrap items-end justify-between gap-[18px] px-5 pb-5 sm:px-6">
          <div className="flex min-w-0 flex-wrap items-end gap-4">
            <LogoControl org={organization} onChanged={refresh} />
            <div className="min-w-0 pb-1">
              <h1 className="m-0 text-[24px] text-navy-ink sm:text-[28px]">{organization.name}</h1>
              <p className="mt-1 mb-0 flex flex-wrap gap-x-3.5 gap-y-1.5 text-[14px] text-muted">
                <span>Customer since {monthYear(organization.customerSince ?? organization.createdAt)}</span>
                {organization.serviceArea && <span>{organization.serviceArea}</span>}
                <span className={cx("font-bold", organization.status === "active" ? "text-success" : organization.status === "onboarding" ? "text-warning" : "text-muted")}>
                  {ORG_STATUS_LABELS[organization.status]}
                </span>
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setInviting(true)}>
              <Icon name="user-plus" size={18} />
              Invite people
            </Button>
            <Button variant="secondary" aria-label="Edit organization" onClick={() => setEditing(true)} className="px-0! w-11">
              <Icon name="edit" size={18} />
            </Button>
            {slots > 0 ? (
              <ButtonLink to="properties/new">
                <Icon name="plus" size={18} strokeWidth={2.2} />
                Add property
              </ButtonLink>
            ) : (
              <Button disabled aria-describedby="limit-note">
                Add property
              </Button>
            )}
          </div>
          {slots === 0 && (
            <p id="limit-note" className="m-0 w-full text-right text-[13px] font-semibold text-warning">
              {organization.name} has all {organization.propertyLimit} of its properties. Ask CBES to raise the limit.
            </p>
          )}
        </div>
        <div className="border-t border-row-line px-3 sm:px-5">
          <Tabs
            label="Organization sections"
            variant="underline"
            idPrefix="org"
            value={tab}
            onChange={(t) => update({ tab: t === "properties" ? null : t })}
            tabs={[
              { value: "properties", label: "Properties", count: properties.length },
              { value: "people", label: "People", count: people },
              { value: "invitations", label: "Invitations", count: invitations.length },
              ...(area === "admin"
                ? ([
                    { value: "reports", label: "Reports", count: kpis.openReports || undefined },
                    { value: "violations", label: "Violations", count: kpis.violations30d || undefined },
                    { value: "activity", label: "Activity" },
                  ] as const)
                : []),
            ]}
          />
        </div>
      </section>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3.5">
        <StatTile label="Properties" value={`${kpis.properties} of ${organization.propertyLimit}`} sub={`${slots} slot${slots === 1 ? "" : "s"} left`} />
        <StatTile label="Units under service" value={formatCount(kpis.units)} />
        <StatTile
          label="Open resident reports"
          value={kpis.openReports}
          sub={kpis.oldestOpenHours === null ? "None waiting" : `Oldest ${age(kpis.oldestOpenHours)}`}
          tone={kpis.oldestOpenHours !== null && kpis.oldestOpenHours >= 20 ? "bad" : "neutral"}
        />
        {kpis.violations30d !== undefined && (
          <StatTile
            label="Violations, 30 days"
            value={formatCount(kpis.violations30d)}
            sub={kpis.violationsPer100Units == null ? undefined : `${kpis.violationsPer100Units} per 100 units`}
          />
        )}
        <StatTile label="Avg first reply" value={replyHours(kpis.avgReplyHours)} sub="Last 30 days" />
      </div>

      <div id="org-panel" role="tabpanel" aria-labelledby={`org-tab-${tab}`}>
        {tab === "properties" && (
          <div className="flex flex-wrap items-start gap-5">
            <PropertyGrid org={organization} properties={properties} linkTo={propertyLink} addTo={slots > 0 ? "properties/new" : null} slots={slots} />
            <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-4">
              <AsideCard
                title="Representatives"
                action={
                  isAdmin && (
                    <button type="button" onClick={() => setInviting(true)} className="text-[13px] font-bold text-navy hover:underline">
                      + Invite
                    </button>
                  )
                }
              >
                <p className="mt-0 mb-3 text-[12.5px] text-muted">See and manage every property in {organization.name}. Can add properties and invite managers.</p>
                {representatives.length === 0 ? (
                  <p className="m-0 text-[14px] text-muted">None yet.</p>
                ) : (
                  <PersonList>
                    {representatives.map((r) => (
                      <PersonRow key={r.id} id={r.id} name={r.name ?? r.email} detail={r.email} />
                    ))}
                  </PersonList>
                )}
              </AsideCard>
              <AsideCard title="Property staff">
                {staff.length === 0 ? (
                  <p className="m-0 text-[14px] text-muted">No property managers or Directors yet.</p>
                ) : (
                  <PersonList>
                    {groupStaff(staff).map((s) => (
                      <PersonRow key={s.id} id={s.id} name={s.name} detail={`${s.roles} · ${s.properties}`} />
                    ))}
                  </PersonList>
                )}
              </AsideCard>
              {invitations.length > 0 && (
                <AsideCard title="Waiting to accept">
                  <ul className="m-0 flex list-none flex-col gap-2.5 p-0 text-[13.5px]">
                    {invitations.map((i) => (
                      <li key={i.id} className="flex items-center justify-between gap-2">
                        <span className="min-w-0">
                          <strong className="block break-words">{i.email}</strong>
                          <span className="text-[12px] text-muted">
                            {INVITE_ROLE_LABELS[i.role]}
                            {i.propertyName ? ` · ${i.propertyName}` : ""} · {timeAgo(i.createdAt)}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                  <button type="button" onClick={() => update({ tab: "invitations" })} className="mt-3 text-[13px] font-bold text-navy hover:underline">
                    Manage invitations
                  </button>
                </AsideCard>
              )}
            </aside>
          </div>
        )}

        {tab === "people" && (
          <section className="rounded-[14px] border border-line bg-white">
            {representatives.length + staff.length === 0 ? (
              <EmptyState icon="users" title="Nobody yet" body="Invite a Representative to run this organization, or its property managers and Directors." action={<Button onClick={() => setInviting(true)}>Invite people</Button>} />
            ) : (
              <ul className="m-0 list-none divide-y divide-row-line p-0">
                {representatives.map((r) => (
                  <PeopleRow
                    key={`rep-${r.id}`}
                    id={r.id}
                    name={r.name ?? r.email}
                    email={r.email}
                    role="Representative"
                    detail={`Every property · since ${monthYear(r.addedAt)}`}
                    action={
                      isAdmin && (
                        <Button
                          variant="secondary"
                          className="min-h-9! px-3! text-[13px]"
                          onClick={() =>
                            setConfirm({
                              question: `Remove ${r.name ?? r.email} as a Representative of ${organization.name}? They lose access to every property in it.`,
                              path: `${base}/representatives/${r.id}`,
                              message: `${r.name ?? r.email} is no longer a Representative.`,
                            })
                          }
                        >
                          Remove
                        </Button>
                      )
                    }
                  />
                ))}
                {staff.map((s) => (
                  <PeopleRow
                    key={`${s.id}-${s.propertyId}`}
                    id={s.id}
                    name={s.name ?? s.email}
                    email={s.email}
                    role={PROPERTY_ROLE_LABELS[s.role]}
                    detail={s.propertyName}
                    action={
                      <Button
                        variant="secondary"
                        className="min-h-9! px-3! text-[13px]"
                        onClick={() =>
                          setConfirm({
                            question: `Remove ${s.name ?? s.email}'s access to ${s.propertyName}?`,
                            path: `${base}/properties/${s.propertyId}/members/${s.id}`,
                            message: `${s.name ?? s.email} can no longer see ${s.propertyName}.`,
                          })
                        }
                      >
                        Remove access
                      </Button>
                    }
                  />
                ))}
              </ul>
            )}
          </section>
        )}

        <Suspense fallback={null}>
          {tab === "reports" && <ScopedReports scope={{ org: organization.id }} showProperty />}
          {tab === "violations" && <ScopedViolations scope={{ org: organization.id }} showProperty />}
          {tab === "activity" && <OrgActivity orgId={organization.id} />}
        </Suspense>
        {tab === "invitations" && (
          <section className="rounded-[14px] border border-line bg-white">
            {invitations.length === 0 ? (
              <EmptyState icon="mail" title="No invitations waiting" body="Everyone invited has accepted." action={<Button onClick={() => setInviting(true)}>Invite people</Button>} />
            ) : (
              <ul className="m-0 list-none divide-y divide-row-line p-0">
                {invitations.map((i) => (
                  <PeopleRow
                    key={i.id}
                    id={i.email}
                    name={i.name ?? i.email}
                    email={i.name ? i.email : null}
                    role={INVITE_ROLE_LABELS[i.role]}
                    detail={`${i.propertyName ?? `All of ${organization.name}`} · sent ${timeAgo(i.createdAt)}`}
                    action={
                      // Representatives manage the property manager invitations they can send.
                      (isAdmin || i.role === "manager") && (
                        <Button
                          variant="secondary"
                          className="min-h-9! px-3! text-[13px]"
                          disabled={remove.isPending}
                          onClick={() => remove.mutate({ path: `${base}/invitations/${i.id}`, message: `Invitation for ${i.email} cancelled.` })}
                        >
                          Cancel invitation
                        </Button>
                      )
                    }
                  />
                ))}
              </ul>
            )}
          </section>
        )}
      </div>

      {inviting && (
        <InviteModal
          organizationId={organization.id}
          organizationName={organization.name}
          properties={properties}
          isAdmin={isAdmin}
          onClose={() => setInviting(false)}
          onDone={async (message) => {
            setInviting(false);
            toast.success(message);
            await refresh();
          }}
        />
      )}
      {editing && (
        <EditOrganizationModal
          org={organization}
          isAdmin={isAdmin}
          onClose={() => setEditing(false)}
          onDone={async () => {
            setEditing(false);
            toast.success("Organization saved.");
            await refresh();
          }}
        />
      )}
      {confirm && (
        <Modal
          title="Remove access"
          onClose={() => setConfirm(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirm(null)}>
                Keep access
              </Button>
              <Button variant="danger" disabled={remove.isPending} onClick={() => remove.mutate(confirm)}>
                {remove.isPending ? "Removing…" : "Remove"}
              </Button>
            </>
          }
        >
          <p className="m-0 text-[15px] leading-relaxed">{confirm.question}</p>
        </Modal>
      )}

      <Suspense fallback={null}>
        <Outlet context={{ detail: data, area, isAdmin } satisfies OrgOutletContext} />
      </Suspense>
    </div>
  );
}

/** One row per person, with their roles and properties joined. */
function groupStaff(staff: OrganizationDetail["staff"]) {
  const byId = new Map<string, { id: string; name: string; roles: Set<string>; properties: string[] }>();
  for (const s of staff) {
    const row = byId.get(s.id) ?? { id: s.id, name: s.name ?? s.email, roles: new Set(), properties: [] };
    row.roles.add(PROPERTY_ROLE_LABELS[s.role]);
    row.properties.push(s.propertyName);
    byId.set(s.id, row);
  }
  return [...byId.values()].map((r) => ({ id: r.id, name: r.name, roles: [...r.roles].join(", "), properties: r.properties.join(", ") }));
}

function AsideCard({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-[14px] border border-line bg-white p-[18px]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="m-0 text-[17px] text-ink">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function PersonList({ children }: { children: ReactNode }) {
  return <ul className="m-0 flex list-none flex-col gap-3 p-0">{children}</ul>;
}

function PersonRow({ id, name, detail }: { id: string; name: string; detail: string }) {
  return (
    <li className="flex items-center gap-2.5">
      <Avatar name={name} seed={id} size={34} />
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-bold break-words">{name}</span>
        <span className="block text-[12px] break-words text-muted">{detail}</span>
      </span>
    </li>
  );
}

function PeopleRow({ id, name, email, role, detail, action }: { id: string; name: string; email: string | null; role: string; detail: string; action?: ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
      <Avatar name={name} seed={id} size={36} />
      <span className="min-w-0 flex-[1_1_220px]">
        <span className="block font-bold break-words">{name}</span>
        {email && <span className="block text-[13px] break-words text-muted">{email}</span>}
      </span>
      <span className="min-w-0 flex-[1_1_220px] text-[13.5px]">
        <span className="block font-semibold">{role}</span>
        <span className="block text-muted">{detail}</span>
      </span>
      {action}
    </li>
  );
}

function PropertyGrid({
  org,
  properties,
  linkTo,
  addTo,
  slots,
}: {
  org: { id: string; propertyLimit: number };
  properties: OrganizationProperty[];
  linkTo: (id: string) => string;
  addTo: string | null;
  slots: number;
}) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const shown = properties.filter((p) => !needle || p.name.toLowerCase().includes(needle) || p.city?.toLowerCase().includes(needle));
  return (
    <div className="flex min-w-0 flex-[2_1_560px] flex-col gap-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <h2 className="m-0 text-xl text-ink">Properties</h2>
        {properties.length > 3 && (
          <label className="flex h-[38px] items-center gap-2 rounded-[10px] border border-field bg-white px-2.5 text-[13px] text-muted focus-within:border-navy">
            <Icon name="search" size={15} strokeWidth={2} />
            <span className="sr-only">Search properties</span>
            <input type="search" placeholder="Search properties" value={q} onChange={(e) => setQ(e.target.value)} className="w-40 border-0 bg-transparent text-[13px] text-ink outline-none" />
          </label>
        )}
      </div>
      <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(250px,100%),1fr))] gap-4 p-0">
        {shown.map((p) => (
          <li key={p.id}>
            <PropertyCard orgId={org.id} property={p} to={linkTo(p.id)} />
          </li>
        ))}
        {addTo && !needle && (
          <li>
            <Link
              to={addTo}
              className="flex h-full min-h-[280px] flex-col items-center justify-center gap-2.5 rounded-[14px] border-2 border-dashed border-placeholder bg-subtle text-navy no-underline hover:border-navy hover:bg-tint-2"
            >
              <span className="flex size-12 items-center justify-center rounded-full bg-tint-2">
                <Icon name="plus" size={22} strokeWidth={2.2} />
              </span>
              <span className="text-[15px] font-bold">Add a property</span>
              <span className="text-[12.5px] text-muted">
                {slots} of {org.propertyLimit} slots left
              </span>
            </Link>
          </li>
        )}
      </ul>
      {properties.length === 0 && !addTo && <p className="m-0 text-muted">No properties yet.</p>}
      {needle && shown.length === 0 && <p className="m-0 text-muted">No properties match “{q}”.</p>}
    </div>
  );
}

function PropertyCard({ orgId, property: p, to }: { orgId: string; property: OrganizationProperty; to: string }) {
  const status = p.status === "inactive" ? (["Inactive", "neutral"] as const) : p.starting && p.serviceStartDate ? ([`Starting ${monthDay(p.serviceStartDate)}`, "warning"] as const) : (["Active", "success"] as const);
  const facts = [p.city, p.unitCount ? `${formatCount(p.unitCount)} units` : null, p.contractType ? CONTRACT_LABELS[p.contractType] : null].filter(Boolean).join(" · ");
  return (
    <Link to={to} className="flex h-full flex-col overflow-hidden rounded-[14px] border border-line bg-white text-ink no-underline hover:border-navy/40 hover:text-ink">
      <span className="relative block aspect-video">
        <PropertyPhoto orgId={orgId} property={p} />
        <Pill tone={status[1]} className="absolute top-2.5 left-2.5">
          {status[0]}
        </Pill>
      </span>
      <span className="flex flex-1 flex-col gap-2.5 px-4 pt-3.5 pb-4">
        <span>
          <span className="block font-heading text-[16.5px] font-bold">{p.name}</span>
          <span className="mt-0.5 block text-[12.5px] text-muted">{facts || "No details yet"}</span>
        </span>
        <span className="flex flex-wrap gap-1.5">
          <Pill tone={p.openReports ? "danger" : "success"}>
            {p.openReports} open report{p.openReports === 1 ? "" : "s"}
          </Pill>
          {p.violations30d !== undefined && (
            <Pill tone={p.violations30d ? "warning" : "neutral"}>
              {p.violations30d} violation{p.violations30d === 1 ? "" : "s"} 30d
            </Pill>
          )}
        </span>
        <span className="mt-auto flex items-center justify-between gap-2 border-t border-row-line pt-2.5 text-[12.5px]">
          <span className="flex min-w-0 items-center gap-1.5">
            {p.manager ? (
              <>
                <Avatar name={p.manager.name} seed={p.manager.id} size={24} />
                <span className="truncate">{p.manager.name}</span>
              </>
            ) : (
              <span className="text-muted">No manager yet</span>
            )}
          </span>
          {p.steward && <span className="truncate text-muted">Steward {shortName(p.steward.name)}</span>}
        </span>
      </span>
    </Link>
  );
}

const shortName = (name: string) => {
  const [first, last] = name.split(/\s+/);
  return last ? `${first} ${last[0]}.` : first;
};

const monthDay = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" });

/** Click the logo to replace it; admins and the organization's representatives can. */
function LogoControl({ org, onChanged }: { org: OrganizationDetail["organization"]; onChanged: () => Promise<unknown> }) {
  const api = useApi();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const upload = async (file: File) => {
    if (file.size > MAX_IMAGE_BYTES) return toast.error("That image is over 5 MB. Choose a smaller one.");
    setBusy(true);
    try {
      const image = await squareWebp(file);
      await api(`/organizations/${org.id}/logo`, { method: "POST", body: image, headers: { "Content-Type": image.type } });
      await onChanged();
      toast.success("Logo updated.");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative -mt-10">
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        className="group relative block rounded-[18px] shadow-[0_4px_12px_rgba(26,28,94,0.2)]"
      >
        <span className="sr-only">{org.logoVersion ? "Change logo" : "Add a logo"}</span>
        <OrgLogo org={org} size={84} className="border-4 border-white" />
        <span aria-hidden="true" className="absolute inset-1 flex items-center justify-center rounded-[14px] bg-navy-ink/60 text-white opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100">
          <Icon name="camera" size={22} />
        </span>
      </button>
      <input
        ref={input}
        type="file"
        accept={IMAGE_TYPES}
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void upload(file);
        }}
      />
    </div>
  );
}

function EditOrganizationModal({ org, isAdmin, onClose, onDone }: { org: OrganizationDetail["organization"]; isAdmin: boolean; onClose: () => void; onDone: () => Promise<void> }) {
  const api = useApi();
  const { onSubmit, errors, formError, saving } = useFormSubmit(
    (v) =>
      api(`/organizations/${org.id}`, {
        method: "PATCH",
        body: JSON.stringify(isAdmin ? { name: v.get("name"), serviceArea: v.get("serviceArea"), status: v.get("status"), customerSince: v.get("customerSince") } : { name: v.get("name") }),
      }),
    () => onDone(),
  );
  return (
    <Modal
      title="Edit organization"
      context={org.name}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="edit-org" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </>
      }
    >
      <form id="edit-org" onSubmit={onSubmit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField label="Organization name" name="name" required defaultValue={org.name} error={errors.name} className="sm:col-span-2" />
        {isAdmin && (
          <>
            <TextField label="Service area" name="serviceArea" optional defaultValue={org.serviceArea ?? ""} error={errors.serviceArea} className="sm:col-span-2" />
            <SelectField label="Status" name="status" defaultValue={org.status} error={errors.status}>
              {(["onboarding", "active", "inactive"] as const).map((s) => (
                <option key={s} value={s}>
                  {ORG_STATUS_LABELS[s]}
                </option>
              ))}
            </SelectField>
            <TextField label="Customer since" name="customerSince" type="date" optional defaultValue={org.customerSince ?? ""} error={errors.customerSince} />
          </>
        )}
        {formError && (
          <div className="sm:col-span-2">
            <Alert>{formError}</Alert>
          </div>
        )}
      </form>
    </Modal>
  );
}

function InviteModal({
  organizationId,
  organizationName,
  properties,
  isAdmin,
  onClose,
  onDone,
}: {
  organizationId: string;
  organizationName: string;
  properties: OrganizationProperty[];
  isAdmin: boolean;
  onClose: () => void;
  onDone: (message: string) => Promise<void>;
}) {
  const api = useApi();
  const [role, setRole] = useState<InviteRole>(isAdmin ? "representative" : "manager");
  // Only CBES adds Representatives and Directors; Representatives invite property managers.
  const roles: InviteRole[] = isAdmin ? (Object.keys(INVITE_ROLE_LABELS) as InviteRole[]) : ["manager"];
  const forProperties = role !== "representative";

  const { onSubmit, errors, formError, saving } = useFormSubmit(
    (values) =>
      api<{ status: "invited" | "added" }>(`/organizations/${organizationId}/invitations`, {
        method: "POST",
        body: JSON.stringify({ email: values.get("email"), name: values.get("name"), role, propertyIds: forProperties ? values.getAll("propertyIds") : [] }),
      }),
    async (res, values) => {
      const email = String(values.get("email"));
      await onDone(res.status === "added" ? `${email} already has an account, so they have access now.` : `Invitation sent to ${email}. They'll have access after they accept it and sign in.`);
    },
  );

  return (
    <Modal
      title="Invite people"
      context={organizationName}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="invite" disabled={saving || (forProperties && properties.length === 0)}>
            {saving ? "Sending…" : "Send invitation"}
          </Button>
        </>
      }
    >
      <form id="invite" onSubmit={onSubmit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField label="Email" name="email" type="email" autoComplete="off" required error={errors.email} />
        <TextField label="Name" name="name" optional autoComplete="off" error={errors.name} />
        <SelectField
          label="Role"
          name="role"
          value={role}
          onChange={(e) => setRole(e.target.value as InviteRole)}
          disabled={roles.length === 1}
          error={errors.role}
          hint={
            role === "representative"
              ? `Sees and manages every property in ${organizationName}.`
              : isAdmin
                ? "Sees only the properties you choose."
                : "Sees only the properties you choose. To add a Director or another Representative, ask CBES."
          }
          className="sm:col-span-2"
        >
          {roles.map((r) => (
            <option key={r} value={r}>
              {INVITE_ROLE_LABELS[r]}
            </option>
          ))}
        </SelectField>
        {forProperties && (
          <fieldset className="m-0 min-w-0 border-0 p-0 sm:col-span-2" aria-describedby={errors.propertyIds ? "invite-properties-error" : undefined}>
            <legend className="mb-1.5 p-0 text-sm font-semibold">Properties</legend>
            {properties.length === 0 ? (
              <p className="m-0 text-[15px] text-muted">Add a property first, then invite its managers.</p>
            ) : (
              <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
                {properties.map((p) => (
                  <label key={p.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-1 hover:bg-tint">
                    <input type="checkbox" name="propertyIds" value={p.id} defaultChecked={properties.length === 1} className="size-5 accent-navy" />
                    <span className="min-w-0 break-words">{p.name}</span>
                  </label>
                ))}
              </div>
            )}
            {errors.propertyIds && (
              <p id="invite-properties-error" className="mt-1 mb-0 text-[13px] font-semibold text-danger">
                {errors.propertyIds}
              </p>
            )}
          </fieldset>
        )}
        {formError && (
          <div className="sm:col-span-2">
            <Alert>{formError}</Alert>
          </div>
        )}
      </form>
    </Modal>
  );
}
