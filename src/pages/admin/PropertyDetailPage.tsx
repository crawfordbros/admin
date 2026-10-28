import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { useUser } from "@clerk/clerk-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import {
  ApiError,
  errorMessage,
  useApi,
  type ContractType,
  type OrganizationRow,
  type PropertyDetail,
  type PropertyProfile,
  type PropertyRole,
  type PropertyType,
  type StaffOption,
  type WeeklyReport,
} from "../../lib/api";
import { CONTRACT_LABELS, PROPERTY_ROLE_LABELS, PROPERTY_TYPE_LABELS, VALET_STATUS_TEXT, addDays, age, formatCount, formatDay, monthYear, replyHours, timeAgo } from "../../lib/format";
import { IMAGE_TYPES, MAX_IMAGE_BYTES, squareWebp } from "../../lib/images";
import { useFormSubmit } from "../../lib/useFormSubmit";
import { lastCompletedWeek } from "../../lib/dates";
import { useQueryState } from "../../lib/useQueryState";
import { Alert, Button, ButtonLink, Loading, SelectField, TextField } from "../../components/ui";
import { Avatar, EmptyState, Pill, StatTile, StatusBadge } from "../../components/display";
import { Tabs } from "../../components/controls";
import { Modal } from "../../components/overlay";
import { PropertyPhoto } from "../../components/brand";
import { Icon } from "../../components/icons";
import { useToast } from "../../components/Toast";
import { useAdminPage } from "../../components/admin/adminPage";
import { cx } from "../../components/styles";
import { propertyPath } from "./paths";
import { roleFrom } from "../../access";
import { PropertyOverwatch, ScopedReports, ScopedViolations } from "./scoped";

type Tab = "overview" | "violations" | "reports" | "overwatch" | "team" | "weekly" | "settings";
const TABS: Tab[] = ["overview", "violations", "reports", "overwatch", "team", "weekly", "settings"];

const card = "rounded-[14px] border border-line bg-white p-5";

/** /admin/organizations/:orgId/properties/:propertyId (ADMIN_PORTAL_SPEC 7.10). */
export function PropertyDetailPage() {
  const { user } = useUser();
  const isSuper = roleFrom(user?.publicMetadata) === "super_admin";
  const { orgId = "", propertyId = "" } = useParams();
  const api = useApi();
  const queryClient = useQueryClient();
  const { params, update } = useQueryState();
  const key = ["property", orgId, propertyId];
  const { data, error, isPending } = useQuery({
    queryKey: key,
    queryFn: () => api<PropertyDetail>(`/organizations/${orgId}/properties/${propertyId}`),
    retry: false,
  });
  const p = data?.property;
  useAdminPage(
    p?.name ?? null,
    p && [
      { label: "Organizations", to: "/admin/organizations" },
      { label: p.organizationName ?? "Organization", to: `/admin/organizations/${orgId}` },
      { label: p.name },
    ],
  );

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: key }),
      queryClient.invalidateQueries({ queryKey: ["organization", orgId] }),
      queryClient.invalidateQueries({ queryKey: ["organizations"] }),
      queryClient.invalidateQueries({ queryKey: ["admin"] }),
    ]);

  if (isPending) return <Loading />;
  // The property may have moved to another organization since the link was made.
  if (error instanceof ApiError && error.status === 404) return <Navigate to={`/admin/properties/${propertyId}`} replace />;
  if (error) return <Alert>{errorMessage(error)}</Alert>;

  const { property } = data;
  const tab = (TABS.includes(params.get("tab") as Tab) ? params.get("tab") : "overview") as Tab;
  const status = property.status === "inactive" ? (["Inactive", "neutral"] as const) : property.starting ? (["Starting", "warning"] as const) : (["Active", "success"] as const);
  const where = [property.address, property.city, [property.city ? "GA" : null, property.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-2xl border border-line bg-white px-5 pt-5 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-[18px]">
          <div className="flex min-w-0 items-center gap-[18px]">
            <span className="block size-24 flex-none overflow-hidden rounded-[18px] border border-line">
              <PropertyPhoto orgId={orgId} property={property} />
            </span>
            <div className="min-w-0">
              <h1 className="m-0 text-[24px] text-navy-ink sm:text-[28px]">{property.name}</h1>
              <p className="mt-1 mb-2.5 text-[14px] text-muted">
                {where || "No address yet"}
                {property.county && ` · ${property.county} County`}
              </p>
              <div className="flex flex-wrap gap-1.5">
                <Pill tone={status[1]}>{status[0]}</Pill>
                {property.unitCount !== null && (
                  <Pill tone="navy">
                    {formatCount(property.unitCount)} units{property.buildingCount ? ` · ${property.buildingCount} buildings` : ""}
                  </Pill>
                )}
                {property.contractType && (
                  <Pill tone="gold">
                    {CONTRACT_LABELS[property.contractType]}
                    {property.serviceStartDate && ` · since ${monthYear(property.serviceStartDate)}`}
                  </Pill>
                )}
                {property.connecteamJobId && <Pill tone="neutral">Connecteam job {property.connecteamJobId}</Pill>}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isSuper && <ButtonLink to={`/portal/properties/${property.id}?as=manager`} variant="secondary">
              <Icon name="eye" size={18} />
              See what managers see
            </ButtonLink>}
            <Button variant="secondary" aria-label="Edit property" className="w-11 px-0!" onClick={() => update({ tab: "settings" })}>
              <Icon name="edit" size={18} />
            </Button>
            <ButtonLink to={`/portal/properties/${property.id}/report`}>Weekly report</ButtonLink>
          </div>
        </div>
        <div className="mt-4">
          <Tabs
            label="Property sections"
            variant="underline"
            idPrefix="property"
            value={tab}
            onChange={(t) => update({ tab: t === "overview" ? null : t })}
            tabs={[
              { value: "overview", label: "Overview" },
              { value: "violations", label: "Violations" },
              { value: "reports", label: "Reports", count: data.stats.openReports || undefined },
              { value: "overwatch", label: "Overwatch" },
              { value: "team", label: "Team", count: data.valets.length + (data.steward ? 1 : 0) + data.members.length },
              { value: "weekly", label: "Weekly reports" },
              { value: "settings", label: "Settings" },
            ]}
          />
        </div>
      </section>

      <div id="property-panel" role="tabpanel" aria-labelledby={`property-tab-${tab}`} className="flex flex-col gap-5">
        {tab === "overview" && <Overview detail={data} onTeam={() => update({ tab: "team" })} />}
        {tab === "violations" && <ScopedViolations scope={{ property: property.id }} />}
        {tab === "reports" && <ScopedReports scope={{ property: property.id }} />}
        {tab === "overwatch" && <PropertyOverwatch propertyId={property.id} />}
        {tab === "team" && <Team orgId={orgId} detail={data} onChanged={refresh} />}
        {tab === "weekly" && <WeeklyList property={property} />}
        {tab === "settings" && <Settings orgId={orgId} property={property} onSaved={refresh} />}
      </div>
    </div>
  );
}

/** Last week's report, for nights serviced and valet clock-ins. */
function useLastWeek(propertyId: string) {
  const api = useApi();
  return useQuery({
    queryKey: ["portal", "report", propertyId, ""],
    queryFn: () => api<WeeklyReport>(`/portal/properties/${propertyId}/report`),
    retry: false,
  });
}

function Overview({ detail, onTeam }: { detail: PropertyDetail; onTeam: () => void }) {
  const { property, stats, recentReports, steward, valets, members, invitations } = detail;
  const week = useLastWeek(property.id);
  const valet = week.data?.valetTimes;
  const nights = valet?.status === "ok" ? valet.nights.length : null;

  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3.5">
        <StatTile label="Nights serviced" value={nights === null ? "—" : nights} sub={valet && valet.status !== "ok" ? "Connecteam not linked" : week.data ? week.data.week.label : "Last week"} />
        <StatTile label="Avg valet clock-in" value={valet?.status === "ok" ? (valet.avgClockIn ?? "—") : "—"} sub="From Connecteam" />
        <StatTile
          label="Open resident reports"
          value={stats.openReports}
          sub={stats.oldestOpenHours === null ? "None waiting" : `Oldest ${age(stats.oldestOpenHours)}`}
          tone={stats.oldestOpenHours !== null && stats.oldestOpenHours >= 20 ? "bad" : "neutral"}
        />
        <StatTile label="Avg first reply" value={replyHours(stats.avgReplyHours)} sub="Last 30 days" />
      </div>
      {valet && valet.status !== "ok" && <p className="-mt-2 mb-0 text-[13px] text-muted">{VALET_STATUS_TEXT[valet.status]}</p>}

      <div className="flex flex-wrap items-start gap-5">
        <section className={cx(card, "min-w-0 flex-[2_1_560px]")}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="m-0 text-lg text-ink">Resident reports</h2>
            <Link to={`/portal/properties/${property.id}`} className="text-[13px] font-bold">
              All reports
            </Link>
          </div>
          {recentReports.length === 0 ? (
            <p className="m-0 text-[14px] text-muted">No resident reports yet.</p>
          ) : (
            <ul className="m-0 list-none p-0">
              {recentReports.map((r) => (
                <li key={r.refNo} className="flex items-center gap-3 border-t border-row-line py-2.5 first:border-t-0">
                  <span className="min-w-0 flex-1">
                    <strong className="block text-[14px]">
                      #{r.refNo} {r.issueLabel}
                    </strong>
                    <span className="text-[12.5px] text-muted">
                      {r.unit ? `Unit ${r.unit} · ` : ""}
                      {timeAgo(r.createdAt)}
                    </span>
                  </span>
                  <StatusBadge kind="report" status={r.status} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-5">
          <section className={card}>
            <div className="mb-1 flex items-center justify-between gap-2">
              <h2 className="m-0 text-[17px] text-ink">CBES team</h2>
              <button type="button" onClick={onTeam} className="text-[13px] font-bold text-navy hover:underline">
                Manage
              </button>
            </div>
            <p className="mt-0 mb-3.5 text-[12.5px] text-muted">Steward and valets assigned to this property</p>
            {!steward && valets.length === 0 ? (
              <p className="m-0 text-[14px] text-muted">Nobody assigned yet.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {steward && <PersonLine id={steward.id} name={steward.name} detail={`Steward · ${steward.propertyCount} ${steward.propertyCount === 1 ? "property" : "properties"}`} tag={<Pill tone="navy">Lead</Pill>} />}
                {valets.map((v) => (
                  <PersonLine key={v.id} id={v.id} name={v.name} detail="Valet" />
                ))}
              </ul>
            )}
          </section>
          <section className={card}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="m-0 text-[17px] text-ink">Property staff</h2>
              <button type="button" onClick={onTeam} className="text-[13px] font-bold text-navy hover:underline">
                + Invite
              </button>
            </div>
            {members.length + invitations.length === 0 ? (
              <p className="m-0 text-[14px] text-muted">No property managers yet.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {members.map((m) => (
                  <PersonLine key={m.id} id={m.id} name={m.name ?? m.email} detail={PROPERTY_ROLE_LABELS[m.role]} />
                ))}
                {invitations.map((i) => (
                  <PersonLine key={i.id} id={i.email} name={i.name ?? i.email} detail={`${PROPERTY_ROLE_LABELS[i.role]} · invited ${timeAgo(i.createdAt)}`} tag={<Pill tone="warning">Invited</Pill>} />
                ))}
              </ul>
            )}
          </section>
          <section className="rounded-[14px] border border-dashed border-placeholder bg-subtle p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="m-0 text-[17px] text-ink">Overwatch</h2>
              <Pill tone="gold">Phase 2</Pill>
            </div>
            <p className="mt-2 mb-3 text-[13.5px] leading-normal text-muted">Units that reach the violation threshold will show here, and property managers will open Overwatch cases from this card.</p>
            <Button variant="secondary" disabled className="w-full">
              Create Overwatch case
            </Button>
          </section>
        </aside>
      </div>
    </>
  );
}

function PersonLine({ id, name, detail, tag }: { id: string; name: string; detail: string; tag?: ReactNode }) {
  return (
    <li className="flex items-center gap-2.5">
      <Avatar name={name} seed={id} size={36} />
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-bold break-words">{name}</span>
        <span className="block text-[12px] text-muted">{detail}</span>
      </span>
      {tag}
    </li>
  );
}

function Team({ orgId, detail, onChanged }: { orgId: string; detail: PropertyDetail; onChanged: () => Promise<unknown> }) {
  const api = useApi();
  const toast = useToast();
  const { property, steward, valets, members, invitations } = detail;
  const [inviting, setInviting] = useState(false);
  const stewards = useQuery({ queryKey: ["admin", "stewards"], queryFn: () => api<{ items: StaffOption[] }>("/admin/stewards") });
  const valetOptions = useQuery({ queryKey: ["admin", "valets"], queryFn: () => api<{ items: StaffOption[] }>("/admin/valets") });

  const run = useMutation({
    mutationFn: ({ path, method, body }: { path: string; method: string; body?: unknown; done: string }) => api(path, { method, body: body === undefined ? undefined : JSON.stringify(body) }),
    onSuccess: async (_r, { done }) => {
      toast.success(done);
      await onChanged();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const base = `/organizations/${orgId}/properties/${property.id}`;
  const unassigned = valetOptions.data?.items.filter((v) => !valets.some((x) => x.id === v.id)) ?? [];
  // Until the list loads, the current Steward is the only choice shown, so the select doesn't read "No Steward".
  const stewardOptions = stewards.data?.items ?? (steward ? [steward] : []);

  return (
    <div className="flex flex-wrap items-start gap-5">
      <section className={cx(card, "min-w-0 flex-[1_1_420px]")}>
        <h2 className="m-0 text-lg text-ink">CBES team</h2>
        <p className="mt-1 mb-4 text-[13px] text-muted">The Steward and valets get pinged when someone notes a violation here.</p>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Steward
          <select
            value={steward?.id ?? ""}
            disabled={run.isPending}
            onChange={(e) =>
              run.mutate({
                path: base,
                method: "PATCH",
                body: { stewardUserId: e.target.value || null },
                done: e.target.value ? `${stewardOptions.find((s) => s.id === e.target.value)?.name ?? "Steward"} is now the Steward.` : "Steward removed.",
              })
            }
            className="min-h-11 rounded-lg border border-field bg-white px-3 text-base font-normal"
          >
            <option value="">No Steward</option>
            {stewardOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.propertyCount ?? 0} {s.propertyCount === 1 ? "property" : "properties"})
              </option>
            ))}
          </select>
        </label>
        {stewards.data?.items.length === 0 && <p className="mt-1.5 mb-0 text-[13px] text-muted">No Stewards have accounts yet.</p>}

        <h3 className="mt-5 mb-2 text-[15px]">Valets</h3>
        {valets.length === 0 ? (
          <p className="mt-0 text-[14px] text-muted">No valets assigned.</p>
        ) : (
          <ul className="m-0 mb-3 flex list-none flex-col gap-2.5 p-0">
            {valets.map((v) => (
              <li key={v.id} className="flex items-center gap-2.5">
                <Avatar name={v.name} seed={v.id} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-bold">{v.name}</span>
                  <span className="block text-[12px] text-muted">{v.email}</span>
                </span>
                <Button
                  variant="secondary"
                  className="min-h-9! px-3! text-[13px]"
                  disabled={run.isPending}
                  onClick={() => run.mutate({ path: `/admin/properties/${property.id}/valets/${v.id}`, method: "DELETE", done: `${v.name} unassigned.` })}
                >
                  Unassign
                </Button>
              </li>
            ))}
          </ul>
        )}
        {unassigned.length > 0 && (
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            Assign a valet
            <select
              value=""
              disabled={run.isPending}
              onChange={(e) => {
                const v = unassigned.find((x) => x.id === e.target.value);
                if (v) run.mutate({ path: `/admin/properties/${property.id}/valets/${v.id}`, method: "PUT", done: `${v.name} assigned.` });
              }}
              className="min-h-11 rounded-lg border border-field bg-white px-3 text-base font-normal"
            >
              <option value="">Choose a valet</option>
              {unassigned.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </section>

      <section className={cx(card, "min-w-0 flex-[1_1_420px]")}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="m-0 text-lg text-ink">Property staff</h2>
          <Button variant="secondary" className="min-h-9! px-3! text-[13px]" onClick={() => setInviting(true)}>
            <Icon name="user-plus" size={16} />
            Invite
          </Button>
        </div>
        {members.length + invitations.length === 0 ? (
          <EmptyState icon="users" title="No property staff yet" body="Invite the Property Manager, who gets the weekly report." />
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
            {members.map((m) => (
              <li key={m.id} className="flex items-center gap-2.5">
                <Avatar name={m.name ?? m.email} seed={m.id} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-bold break-words">{m.name ?? m.email}</span>
                  <span className="block text-[12px] text-muted">{PROPERTY_ROLE_LABELS[m.role]}</span>
                </span>
                <Button
                  variant="secondary"
                  className="min-h-9! px-3! text-[13px]"
                  disabled={run.isPending}
                  onClick={() => run.mutate({ path: `/organizations/${orgId}/properties/${property.id}/members/${m.id}`, method: "DELETE", done: `${m.name ?? m.email} can no longer see ${property.name}.` })}
                >
                  Remove access
                </Button>
              </li>
            ))}
            {invitations.map((i) => (
              <li key={i.id} className="flex items-center gap-2.5">
                <Avatar name={i.name ?? i.email} seed={i.email} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-bold break-words">{i.name ?? i.email}</span>
                  <span className="block text-[12px] text-muted">
                    {PROPERTY_ROLE_LABELS[i.role]} · invited {timeAgo(i.createdAt)}
                  </span>
                </span>
                <Button
                  variant="secondary"
                  className="min-h-9! px-3! text-[13px]"
                  disabled={run.isPending}
                  onClick={() => run.mutate({ path: `/organizations/${orgId}/invitations/${i.id}`, method: "DELETE", done: `Invitation for ${i.email} cancelled.` })}
                >
                  Cancel
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {inviting && (
        <PropertyInviteModal
          orgId={orgId}
          property={property}
          onClose={() => setInviting(false)}
          onDone={async (message) => {
            setInviting(false);
            toast.success(message);
            await onChanged();
          }}
        />
      )}
    </div>
  );
}

function PropertyInviteModal({ orgId, property, onClose, onDone }: { orgId: string; property: PropertyProfile; onClose: () => void; onDone: (message: string) => Promise<void> }) {
  const api = useApi();
  const { onSubmit, errors, formError, saving } = useFormSubmit(
    (v) =>
      api<{ status: "invited" | "added" }>(`/organizations/${orgId}/invitations`, {
        method: "POST",
        body: JSON.stringify({ email: v.get("email"), name: v.get("name"), role: v.get("role") as PropertyRole, propertyIds: [property.id] }),
      }),
    async (res, v) => {
      const email = String(v.get("email"));
      await onDone(res.status === "added" ? `${email} already has an account, so they can see ${property.name} now.` : `Invitation sent to ${email}.`);
    },
  );
  return (
    <Modal
      title="Invite property staff"
      context={property.name}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="property-invite" disabled={saving}>
            {saving ? "Sending…" : "Send invitation"}
          </Button>
        </>
      }
    >
      <form id="property-invite" onSubmit={onSubmit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField label="Email" name="email" type="email" autoComplete="off" required error={errors.email} />
        <TextField label="Name" name="name" autoComplete="off" optional error={errors.name} />
        <SelectField label="Role" name="role" defaultValue="manager" error={errors.role} hint="Property Managers get the weekly report by email." className="sm:col-span-2">
          {(["manager"] as const).map((r) => (
            <option key={r} value={r}>
              {PROPERTY_ROLE_LABELS[r]}
            </option>
          ))}
        </SelectField>
        {formError && (
          <div className="sm:col-span-2">
            <Alert>{formError}</Alert>
          </div>
        )}
      </form>
    </Modal>
  );
}

function WeeklyList({ property }: { property: PropertyProfile }) {
  const first = lastCompletedWeek();
  const weeks = Array.from({ length: 8 }, (_, i) => addDays(first, -7 * i));
  return (
    <section className={card}>
      <h2 className="m-0 text-lg text-ink">Weekly reports</h2>
      <p className="mt-1 mb-4 text-[13.5px] text-muted">Each week runs Sunday to Saturday. Property Managers get theirs Monday at 7:00 AM.</p>
      <ul className="m-0 list-none p-0">
        {weeks.map((w, i) => (
          <li key={w} className="flex flex-wrap items-center justify-between gap-3 border-t border-row-line py-3 first:border-t-0">
            <span>
              <strong className="block text-[14.5px]">
                {formatDay(w)} – {formatDay(addDays(w, 6))}
              </strong>
              {i === 0 && <span className="text-[12.5px] text-muted">Last week</span>}
            </span>
            <ButtonLink to={`/portal/properties/${property.id}/report?week=${w}`} variant="secondary" className="min-h-9! px-3! text-[13px]">
              Preview
            </ButtonLink>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Settings({ orgId, property, onSaved }: { orgId: string; property: PropertyProfile; onSaved: () => Promise<unknown> }) {
  const api = useApi();
  const toast = useToast();
  const navigate = useNavigate();
  const orgs = useQuery({ queryKey: ["organizations"], queryFn: () => api<{ organizations: OrganizationRow[] }>("/organizations") });
  const base = `/organizations/${orgId}/properties/${property.id}`;

  const { onSubmit, errors, formError, saving } = useFormSubmit(
    (v) => {
      const text = (k: string) => String(v.get(k) ?? "").trim() || null;
      const num = (k: string) => (text(k) === null ? null : Number(text(k)));
      return api<{ property: PropertyProfile }>(base, {
        method: "PATCH",
        body: JSON.stringify({
          name: text("name"),
          address: text("address"),
          city: text("city"),
          county: text("county"),
          zip: text("zip"),
          // Units can't be cleared; "" gets the API's "Enter at least 1" message.
          unitCount: num("unitCount") ?? "",
          buildingCount: num("buildingCount"),
          propertyType: (text("propertyType") as PropertyType | null) ?? null,
          serviceStartDate: text("serviceStartDate"),
          contractType: (text("contractType") as ContractType | null) ?? null,
          slug: text("slug") ?? undefined,
          status: text("status"),
          connecteamJobId: text("connecteamJobId"),
        }),
      });
    },
    async () => {
      toast.success("Property saved.");
      await onSaved();
    },
  );

  return (
    <div className="flex flex-col gap-5">
      <section className={card}>
        <h2 className="m-0 mb-4 text-lg text-ink">Details</h2>
        <form onSubmit={onSubmit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField label="Property name" name="name" required defaultValue={property.name} error={errors.name} className="sm:col-span-2" />
          <TextField label="Street address" name="address" optional defaultValue={property.address ?? ""} error={errors.address} className="sm:col-span-2" />
          <TextField label="City" name="city" optional defaultValue={property.city ?? ""} error={errors.city} />
          <TextField label="County" name="county" optional defaultValue={property.county ?? ""} error={errors.county} />
          <TextField label="ZIP" name="zip" optional inputMode="numeric" defaultValue={property.zip ?? ""} error={errors.zip} />
          <SelectField label="Property type" name="propertyType" optional defaultValue={property.propertyType ?? ""} error={errors.propertyType}>
            <option value="">Not set</option>
            {(Object.keys(PROPERTY_TYPE_LABELS) as PropertyType[]).map((t) => (
              <option key={t} value={t}>
                {PROPERTY_TYPE_LABELS[t]}
              </option>
            ))}
          </SelectField>
          <TextField label="Units" name="unitCount" type="number" inputMode="numeric" min={1} required defaultValue={property.unitCount ?? ""} error={errors.unitCount} />
          <TextField label="Buildings" name="buildingCount" type="number" inputMode="numeric" min={1} optional defaultValue={property.buildingCount ?? ""} error={errors.buildingCount} />
          <TextField label="Service start date" name="serviceStartDate" type="date" optional defaultValue={property.serviceStartDate ?? ""} error={errors.serviceStartDate} />
          <SelectField label="Contract" name="contractType" optional defaultValue={property.contractType ?? ""} error={errors.contractType}>
            <option value="">Not set</option>
            {(Object.keys(CONTRACT_LABELS) as ContractType[]).map((c) => (
              <option key={c} value={c}>
                {CONTRACT_LABELS[c]}
              </option>
            ))}
          </SelectField>
          <TextField label="Resident report web address" name="slug" defaultValue={property.slug} hint={`/report?p=${property.slug} is printed in the QR code on every container. Changing it breaks printed codes.`} error={errors.slug} />
          <SelectField label="Status" name="status" defaultValue={property.status} error={errors.status}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </SelectField>
          <TextField label="Connecteam job ID" name="connecteamJobId" optional defaultValue={property.connecteamJobId ?? ""} hint="Links valet clock-ins to this property's weekly report." error={errors.connecteamJobId} />
          {formError && (
            <div className="sm:col-span-2">
              <Alert>{formError}</Alert>
            </div>
          )}
          <div className="sm:col-span-2">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </section>

      <PhotoSettings orgId={orgId} property={property} onSaved={onSaved} />

      <section className="rounded-[14px] border border-danger/30 bg-white p-5">
        <h2 className="m-0 text-lg text-danger">Move to another organization</h2>
        <p className="mt-1 mb-4 text-[13.5px] text-muted">Its people and reports move with it. The old organization's Representatives lose access.</p>
        <MoveForm
          current={orgId}
          organizations={orgs.data?.organizations ?? []}
          onMove={async (target) => {
            await api(base, { method: "PATCH", body: JSON.stringify({ organizationId: target }) });
            await onSaved();
            toast.success(`${property.name} moved.`);
            navigate(propertyPath(target, property.id), { replace: true });
          }}
        />
      </section>
    </div>
  );
}

function MoveForm({ current, organizations, onMove }: { current: string; organizations: OrganizationRow[]; onMove: (target: string) => Promise<void> }) {
  const [target, setTarget] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!target) return;
    setSaving(true);
    setError(null);
    try {
      await onMove(target);
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <SelectField label="New organization" value={target} onChange={(e) => setTarget(e.target.value)} className="flex-1">
        <option value="">Choose an organization</option>
        {organizations
          .filter((o) => o.id !== current)
          .map((o) => (
            <option key={o.id} value={o.id} disabled={o.properties >= o.propertyLimit}>
              {o.name}
              {o.properties >= o.propertyLimit ? " (full)" : ""}
            </option>
          ))}
      </SelectField>
      <Button type="submit" variant="danger" disabled={!target || saving}>
        {saving ? "Moving…" : "Move property"}
      </Button>
      {error && <Alert>{error}</Alert>}
    </form>
  );
}

function PhotoSettings({ orgId, property, onSaved }: { orgId: string; property: PropertyProfile; onSaved: () => Promise<unknown> }) {
  const api = useApi();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const base = `/organizations/${orgId}/properties/${property.id}`;

  const run = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await work();
      await onSaved();
      toast.success(done);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const upload = (file: File) =>
    run(async () => {
      if (file.size > MAX_IMAGE_BYTES) throw new Error("That image is over 5 MB. Choose a smaller one.");
      const image = await squareWebp(file);
      const { uploadId } = await api<{ uploadId: string }>(`/organizations/${orgId}/photo-uploads`, { method: "POST", body: image, headers: { "Content-Type": image.type } });
      await api(base, { method: "PATCH", body: JSON.stringify({ photoUploadId: uploadId }) });
    }, "Photo updated.");

  return (
    <section className={cx(card, "flex flex-wrap items-center gap-5")}>
      <span className="block size-24 flex-none overflow-hidden rounded-[18px] border border-line">
        <PropertyPhoto orgId={orgId} property={property} />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="m-0 text-lg text-ink">Photo or logo</h2>
        <p className="mt-1 mb-3 text-[13.5px] text-muted">PNG, JPG or WebP, up to 5 MB. Cropped to a square.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={busy} onClick={() => input.current?.click()}>
            <Icon name="upload" size={18} />
            {property.photoVersion ? "Replace" : "Upload"}
          </Button>
          {property.photoVersion && (
            <Button variant="secondary" disabled={busy} onClick={() => run(() => api(base, { method: "PATCH", body: JSON.stringify({ removePhoto: true }) }), "Photo removed.")}>
              Remove
            </Button>
          )}
        </div>
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
    </section>
  );
}
