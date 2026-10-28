import { Suspense, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@clerk/clerk-react";
import { Link, Outlet, useNavigate } from "react-router-dom";
import { ROLE_LABELS, isAdmin, isSuperAdmin, roleFrom } from "../../access";
import { errorMessage, useApi, type AdminPropertyRow, type AdminUserList, type AdminUserRow, type AuditEntry, type UserGroup } from "../../lib/api";
import { timeAgo } from "../../lib/format";
import { useFormSubmit } from "../../lib/useFormSubmit";
import { useQueryState } from "../../lib/useQueryState";
import { Alert, Button, ButtonLink, Loading, SelectField, TextField } from "../../components/ui";
import { Avatar, EmptyState, PageHeader, Pill } from "../../components/display";
import { Tabs } from "../../components/controls";
import { SearchField } from "../../components/FilterBar";
import { DataTable, Pagination } from "../../components/DataTable";
import { Menu, type MenuItem } from "../../components/Popover";
import { Drawer, Modal } from "../../components/overlay";
import { Icon } from "../../components/icons";
import { useToast } from "../../components/Toast";
import { useAdminPage } from "../../components/admin/adminPage";
import { cx } from "../../components/styles";
import { StepUpField } from "./StepUp";
import { useStepUp } from "../../lib/stepUp";
import { AddRoleModal } from "./AddRoleModal";

type Role = AdminUserRow["role"];

// Role badge colors from the Users design.
const ROLE_STYLE: Record<Role, string> = {
  super_admin: "bg-navy-ink text-white",
  admin: "bg-navy text-white",
  lead: "bg-tint-2 text-navy",
  valet: "bg-neutral-bg text-neutral",
  representative: "bg-gold-tint text-gold-text",
  manager: "bg-success-bg text-success",
};

const CBES_ROLES: { role: Role; label: string; note: string }[] = [
  { role: "super_admin", label: "Super Admin", note: "Manages admin access" },
  { role: "admin", label: "Admin", note: "Everything else" },
  { role: "lead", label: "Stewards", note: "Lead valets on site" },
  { role: "valet", label: "Valets", note: "Log violations" },
];
const ORG_ROLES: { role: Role; label: string; note: string }[] = [
  { role: "representative", label: "Reps", note: "Run an organization" },
  { role: label: "Property Managers", note: "Get weekly reports" },
  { role: "manager", label: "Property Managers", note: "Run one property" },
];

export function RoleBadge({ role }: { role: Role }) {
  return <span className={cx("inline-block rounded-full px-2.5 py-1 text-[12px] leading-none font-bold whitespace-nowrap", ROLE_STYLE[role])}>{ROLE_LABELS[role]}</span>;
}

const isAdminRole = (r: Role) => r === "admin" || r === "super_admin";

/** /admin/users: everyone with a portal account (ADMIN_PORTAL_SPEC 7.11). Residents never have one. */
export function UsersPage() {
  const api = useApi();
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useUser();
  const actorRole = roleFrom(user?.publicMetadata);
  const isSuper = isSuperAdmin(actorRole);
  const { params, update } = useQueryState();
  const [inviting, setInviting] = useState(false);
  const [changing, setChanging] = useState<AdminUserRow | null>(null);
  const [addingRole, setAddingRole] = useState<AdminUserRow | null>(null);
  const [removing, setRemoving] = useState<AdminUserRow | null>(null);
  const [demoting, setDemoting] = useState<AdminUserRow | null>(null);
  const [activity, setActivity] = useState<AdminUserRow | null>(null);
  useAdminPage("Users");

  const group = (["all", "cbes", "orgs", "invited"].includes(params.get("group") ?? "") ? params.get("group") : "all") as UserGroup;
  const role = params.get("role") ?? "";
  const q = params.get("q") ?? "";
  const page = Math.max(1, Number(params.get("page") ?? 1) || 1);
  const query = new URLSearchParams({ group, page: String(page) });
  if (role) query.set("role", role);
  if (q.trim()) query.set("q", q.trim());

  const users = useQuery({ queryKey: ["admin", "users", query.toString()], queryFn: () => api<AdminUserList>(`/admin/users?${query}`), placeholderData: (p) => p });
  const counts = useQuery({ queryKey: ["admin", "users", "role-counts"], queryFn: () => api<Partial<Record<Role, number>>>("/admin/users/role-counts") });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
  const canAddRole = (u: AdminUserRow) => isAdmin(actorRole) && Boolean(u.id) && u.status === "active" && (isSuper || !isAdminRole(u.role) || u.id === user?.id);
  const act = useMutation({
    mutationFn: ({ path, method, body }: { path: string; method: string; done: string; body?: unknown }) => api(path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }),
    onSuccess: async (_r, { done }) => {
      toast.success(done);
      await refresh();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const menu = (u: AdminUserRow): MenuItem[] => {
    const who = u.name ?? u.email;
    if (u.status === "invited" && u.invitationId) {
      const adminInvite = isAdminRole(u.role);
      return [
        { label: "Resend invitation", disabled: adminInvite && !isSuper, onSelect: () => act.mutate({ path: `/admin/invitations/${u.invitationId}/resend`, method: "POST", done: `Invitation to ${u.email} sent again.` }) },
        { label: "Cancel invitation", tone: "danger", disabled: adminInvite && !isSuper, onSelect: () => act.mutate({ path: `/admin/invitations/${u.invitationId}`, method: "DELETE", done: `Invitation to ${u.email} cancelled.` }) },
      ];
    }
    if (!u.id) return [];
    if (u.status === "removed")
      return [
        // Restoring turns the account back on with no access; invite them to an organization or property after.
        { label: "Restore account", disabled: isAdminRole(u.role) && !isSuper, onSelect: () => act.mutate({ path: `/admin/users/${u.id}/restore`, method: "POST", done: `${who}'s account is back on. Give them access from an organization or property.` }) },
        { label: "View activity", onSelect: () => setActivity(u) },
      ];
    const protectedAdmin = isAdminRole(u.role) && !isSuper;
    const items: MenuItem[] = [];
    if (canAddRole(u)) items.push({ label: "Add role", onSelect: () => setAddingRole(u) });
    if (isSuper && !isAdminRole(u.role)) items.push({ label: "Upgrade to Admin", onSelect: () => navigate(`/admin/users/add-admin?user=${u.id}${u.email ? `&q=${encodeURIComponent(u.email)}` : ""}`) });
    if (u.role === "lead" || u.role === "valet") items.push({ label: "Change role", onSelect: () => setChanging(u) });
    // Admin and Steward are separate roles: removing admin leaves a Steward a Steward.
    if (isSuper && u.role === "admin" && u.steward && u.id !== user?.id) items.push({ label: "Remove admin access", tone: "danger", onSelect: () => setDemoting(u) });
    // An admin keeps or gains the Steward role separately; removing it takes them off the properties they lead.
    if (isAdminRole(u.role))
      items.push(
        u.steward
          ? { label: "Remove Steward role", disabled: protectedAdmin, onSelect: () => act.mutate({ path: `/admin/users/${u.id}/steward`, method: "PUT", body: { steward: false }, done: `${who} is no longer a Steward and has been taken off their properties.` }) }
          : { label: "Make Steward", disabled: protectedAdmin, onSelect: () => act.mutate({ path: `/admin/users/${u.id}/steward`, method: "PUT", body: { steward: true }, done: `${who} can now be chosen as a property's Steward.` }) },
      );
    if (u.orgId && ["representative", "manager"].includes(u.role)) items.push({ label: "Change access", to: `/admin/organizations/${u.orgId}?tab=people` });
    items.push(
      { label: "Reset two-step verification", disabled: protectedAdmin, onSelect: () => act.mutate({ path: `/admin/users/${u.id}/reset-mfa`, method: "POST", done: `${who} will set up two-step verification again at their next sign-in.` }) },
      { label: "View activity", onSelect: () => setActivity(u) },
      { label: "Remove access", tone: "danger", disabled: protectedAdmin || u.id === user?.id || u.role === "super_admin", onSelect: () => setRemoving(u) },
    );
    return items;
  };

  const data = users.data;
  const roleChip = (r: { role: Role; label: string; note: string }) => {
    const on = role === r.role;
    return (
      <button
        key={r.role}
        type="button"
        aria-pressed={on}
        onClick={() => update({ role: on ? null : r.role })}
        className={cx("inline-flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-left text-ink", on ? "bg-tint-2 ring-[1.5px] ring-navy" : r.role === "super_admin" ? "bg-gold-tint hover:bg-tint-2" : "bg-canvas hover:bg-tint-2")}
      >
        <span className="font-heading text-lg font-bold">{counts.data?.[r.role] ?? "—"}</span>
        <span>
          <span className="block text-[13px] font-bold">{r.label}</span>
          <span className="block text-[11.5px] text-muted">{r.note}</span>
        </span>
      </button>
    );
  };

  return (
    <>
      <PageHeader
        title="Users"
        description="Everyone with a portal account. Accounts are by invitation only and need two-step verification. Residents don't have accounts: their details stay on the tickets they send."
        actions={
          <>
            <Button variant="secondary" onClick={() => setInviting(true)}>
              <Icon name="user-plus" size={18} strokeWidth={2} />
              Invite CBES staff
            </Button>
            {isSuper && (
              <ButtonLink to="/admin/users/add-admin" className="bg-navy-ink">
                <Icon name="shield" size={18} strokeWidth={2} className="text-gold-light" />
                Add admin
              </ButtonLink>
            )}
          </>
        }
      />

      <section aria-labelledby="roles-title" className="rounded-[14px] border border-line bg-white px-5 py-[18px]">
        <h2 id="roles-title" className="m-0 mb-3.5 text-base text-ink">
          Roles
        </h2>
        <div className="flex flex-wrap gap-6">
          <div className="flex-[1_1_420px]" role="group" aria-labelledby="cbes-team">
            <h3 id="cbes-team" className="m-0 mb-2 font-sans text-[12px] font-bold text-gold-text">
              CBES team
            </h3>
            <div className="flex flex-wrap gap-2">{CBES_ROLES.map(roleChip)}</div>
          </div>
          <div className="flex-[1_1_420px]" role="group" aria-labelledby="org-roles">
            <h3 id="org-roles" className="m-0 mb-2 font-sans text-[12px] font-bold text-gold-text">
              Organizations
            </h3>
            <div className="flex flex-wrap gap-2">{ORG_ROLES.map(roleChip)}</div>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[14px] border border-line bg-white">
        <div className="flex flex-wrap items-center gap-2.5 border-b border-line px-4 py-3.5">
          <Tabs
            label="User groups"
            value={group}
            onChange={(g) => update({ group: g === "all" ? null : g })}
            tabs={[
              { value: "all", label: "Everyone", count: data?.groupCounts.all },
              { value: "cbes", label: "CBES team", count: data?.groupCounts.cbes },
              { value: "orgs", label: "Organizations", count: data?.groupCounts.orgs },
              { value: "invited", label: "Invited", count: data?.groupCounts.invited },
            ]}
          />
          <div className="ml-auto flex min-w-0 flex-[1_1_360px] flex-wrap items-center gap-2.5">
            <SearchField label="Search users" placeholder="Name or email" value={q} onChange={(v) => update({ q: v })} />
            <label className="flex items-center gap-2 text-[13px] font-semibold">
              Role
              <select value={role} onChange={(e) => update({ role: e.target.value || null })} className="h-[38px] rounded-[10px] border border-field bg-white px-2.5 text-[13px]">
                <option value="">All roles</option>
                {[...CBES_ROLES, ...ORG_ROLES].map((r) => (
                  <option key={r.role} value={r.role}>
                    {ROLE_LABELS[r.role]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        {users.error && (
          <div className="p-4">
            <Alert>{errorMessage(users.error)}</Alert>
          </div>
        )}
        <DataTable
          label="Users"
          rows={data?.items ?? []}
          loading={users.isPending}
          rowKey={(u) => u.id ?? u.invitationId ?? u.email}
          minWidth={1040}
          empty={<EmptyState icon="users" title="Nobody matches" body="Try another name, or clear the role filter." />}
          columns={[
            {
              key: "person",
              header: "Person",
              cell: (u) => (
                <span className="flex items-center gap-2.5">
                  <Avatar name={u.name ?? u.email} seed={u.id ?? u.email} size={36} />
                  <span className="min-w-0">
                    <strong className="block break-words">{u.name ?? u.email}</strong>
                    <span className="text-[12px] break-words text-muted">{u.status === "invited" && u.invitedAt ? `Invited ${timeAgo(u.invitedAt)}` : u.email}</span>
                  </span>
                </span>
              ),
            },
            {
              key: "role",
              header: "Role",
              cell: (u) => (
                <span className="flex flex-wrap items-center gap-1">
                  {(u.roles ?? [u.role, ...(u.steward && u.role !== "lead" ? ["lead" as const] : [])]).map((held) => <RoleBadge key={held} role={held} />)}
                  {canAddRole(u) && <button type="button" aria-label={`Add role for ${u.name ?? u.email}`} onClick={() => setAddingRole(u)} className="rounded-md px-2 py-1 text-[12px] font-semibold text-navy hover:bg-tint-2">+ Add role</button>}
                </span>
              ),
            },
            { key: "access", header: "Access", cell: (u) => <span className="text-[13px]">{u.access}</span> },
            {
              key: "mfa",
              header: "Two-step",
              cell: (u) => <Pill tone={u.mfa === "none" ? "warning" : "success"}>{u.mfa === "passkey" ? "Passkey" : u.mfa === "authenticator" ? "Authenticator" : "Not set up"}</Pill>,
            },
            { key: "last", header: "Last active", cell: (u) => <span className="text-[13px] text-muted">{u.lastActiveAt ? timeAgo(u.lastActiveAt) : "—"}</span> },
            { key: "status", header: "Status", cell: (u) => <Pill tone={u.status === "invited" ? "warning" : u.status === "removed" ? "muted" : "neutral"}>{u.status === "invited" ? "Invited" : u.status === "removed" ? "Removed" : "Active"}</Pill> },
            {
              key: "actions",
              header: "",
              srHeader: "Actions",
              cell: (u) => (
                <Menu
                  label={`Actions for ${u.name ?? u.email}`}
                  items={menu(u)}
                  trigger={(p) => (
                    <button type="button" {...p} aria-label={`Actions for ${u.name ?? u.email}`} className="flex size-9 items-center justify-center rounded-[9px] border border-line text-ink hover:bg-canvas aria-expanded:border-navy aria-expanded:bg-tint-2">
                      <Icon name="more" size={18} strokeWidth={2.6} className="rotate-90" />
                    </button>
                  )}
                />
              ),
            },
          ]}
        />
        {data && data.total > data.pageSize && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={(p) => update({ page: p === 1 ? null : String(p) }, { replace: false })} />}
      </section>

      {inviting && (
        <InviteStaffModal
          onClose={() => setInviting(false)}
          onDone={async (email) => {
            setInviting(false);
            toast.success(`Invitation sent to ${email}.`);
            await refresh();
          }}
        />
      )}
      {addingRole && actorRole && (
        <AddRoleModal
          user={addingRole}
          actorRole={actorRole}
          onClose={() => setAddingRole(null)}
          onDone={async (message) => {
            setAddingRole(null);
            toast.success(message);
            await queryClient.invalidateQueries();
          }}
        />
      )}
      {changing && (
        <ChangeRoleModal
          user={changing}
          onClose={() => setChanging(null)}
          onDone={async (message) => {
            setChanging(null);
            toast.success(message);
            await refresh();
          }}
        />
      )}
      {removing && (
        <RemoveAccessModal
          user={removing}
          onClose={() => setRemoving(null)}
          onDone={async (message) => {
            setRemoving(null);
            toast.success(message);
            await refresh();
          }}
        />
      )}
      {demoting && (
        <RemoveAdminModal
          user={demoting}
          onClose={() => setDemoting(null)}
          onDone={async (message) => {
            setDemoting(null);
            toast.success(message);
            await refresh();
          }}
        />
      )}
      {activity && <ActivityDrawer user={activity} onClose={() => setActivity(null)} />}
      <Suspense fallback={null}>
        <Outlet />
      </Suspense>
    </>
  );
}

function InviteStaffModal({ onClose, onDone }: { onClose: () => void; onDone: (email: string) => Promise<void> }) {
  const api = useApi();
  const properties = useQuery({ queryKey: ["admin", "properties"], queryFn: () => api<{ properties: AdminPropertyRow[] }>("/admin/properties") });
  const [filter, setFilter] = useState("");
  const { onSubmit, errors, formError, saving } = useFormSubmit(
    (v) =>
      api("/admin/staff-invitations", {
        method: "POST",
        body: JSON.stringify({ email: v.get("email"), name: v.get("name") || undefined, role: v.get("role"), propertyIds: v.getAll("propertyIds") }),
      }),
    (_r, v) => onDone(String(v.get("email"))),
  );
  const needle = filter.trim().toLowerCase();
  const list = (properties.data?.properties ?? []).filter((p) => p.status === "active" && (!needle || p.name.toLowerCase().includes(needle)));
  return (
    <Modal
      title="Invite CBES staff"
      context="Stewards and valets set a password and two-step verification from the email"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="invite-staff" disabled={saving}>
            {saving ? "Sending…" : "Send invitation"}
          </Button>
        </>
      }
    >
      <form id="invite-staff" onSubmit={onSubmit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField label="Email" name="email" type="email" required autoComplete="off" error={errors.email} />
        <TextField label="Name" name="name" optional autoComplete="off" error={errors.name} />
        <SelectField label="Role" name="role" defaultValue="valet" error={errors.role} className="sm:col-span-2" hint="Stewards lead the valets at their properties and get pinged on violation notes.">
          <option value="valet">Valet</option>
          <option value="lead">Steward</option>
        </SelectField>
        <fieldset className="m-0 min-w-0 border-0 p-0 sm:col-span-2">
          <legend className="mb-1.5 p-0 text-sm font-semibold">
            Properties <span className="font-normal text-muted">(optional, change later from each property's Team tab)</span>
          </legend>
          <input type="search" aria-label="Filter properties" placeholder="Filter properties" value={filter} onChange={(e) => setFilter(e.target.value)} className="mb-2 h-10 w-full rounded-lg border border-field px-3 text-[14px]" />
          <div className="flex max-h-56 flex-col gap-0.5 overflow-y-auto rounded-lg border border-line p-1">
            {list.map((p) => (
              <label key={p.id} className="flex min-h-10 cursor-pointer items-center gap-3 rounded-md px-2 hover:bg-tint">
                <input type="checkbox" name="propertyIds" value={p.id} className="size-5 accent-navy" />
                <span>
                  {p.name}
                  {p.city && <span className="text-muted"> · {p.city}</span>}
                </span>
              </label>
            ))}
            {properties.data && list.length === 0 && <p className="m-0 p-2 text-[14px] text-muted">No properties match.</p>}
          </div>
          {errors.propertyIds && <p className="mt-1 mb-0 text-[13px] font-semibold text-danger">{errors.propertyIds}</p>}
        </fieldset>
        {formError && (
          <div className="sm:col-span-2">
            <Alert>{formError}</Alert>
          </div>
        )}
      </form>
    </Modal>
  );
}

/** The Super Admin takes admin away from an admin who is also a Steward; they stay a Steward. */
function RemoveAdminModal({ user, onClose, onDone }: { user: AdminUserRow; onClose: () => void; onDone: (message: string) => Promise<void> }) {
  const api = useApi();
  const stepUp = useStepUp();
  const [code, setCode] = useState("");
  const who = user.name ?? user.email;
  const first = who.split(/[\s@]/)[0];
  const save = useMutation({
    mutationFn: async () => api(`/admin/admins/${user.id}`, { method: "DELETE", body: JSON.stringify({ stepUpToken: await stepUp.confirm(code) }) }),
    onSuccess: () => onDone(`${who} is no longer an admin. They're still a Steward on their properties.`),
  });
  return (
    <Modal
      title="Remove admin access"
      context={who}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" disabled={save.isPending || !stepUp.method} onClick={() => save.mutateAsync().catch(() => {})}>
            {save.isPending ? "Confirming…" : stepUp.method === "authenticator" ? "Confirm with code and remove" : "Confirm with passkey and remove"}
          </Button>
        </>
      }
    >
      <p className="m-0 flex flex-wrap items-center gap-2 text-[15px]">
        <RoleBadge role="admin" />
        <Icon name="chevron-right" size={18} />
        <RoleBadge role="lead" />
      </p>
      <p className="mt-3 mb-4 text-[14px] text-muted">
        {first} loses admin access at their next sign-in. They stay the Steward on the properties they lead and keep their valets.
      </p>
      <StepUpField stepUp={stepUp} code={code} onCode={setCode} notice="The other admins get an email, and the change is logged." />
      {save.error && (
        <div className="mt-3">
          <Alert>{errorMessage(save.error)}</Alert>
        </div>
      )}
    </Modal>
  );
}

function ChangeRoleModal({ user, onClose, onDone }: { user: AdminUserRow; onClose: () => void; onDone: (message: string) => Promise<void> }) {
  const api = useApi();
  const next = user.role === "lead" ? "valet" : "lead";
  const who = user.name ?? user.email;
  const save = useMutation({
    mutationFn: () => api(`/admin/users/${user.id}`, { method: "PATCH", body: JSON.stringify({ role: next }) }),
    onSuccess: () => onDone(`${who} is now a ${ROLE_LABELS[next]}.`),
  });
  return (
    <Modal
      title="Change role"
      context={who}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            Make {ROLE_LABELS[next]}
          </Button>
        </>
      }
    >
      <p className="m-0 flex flex-wrap items-center gap-2 text-[15px]">
        <RoleBadge role={user.role} />
        <Icon name="chevron-right" size={18} />
        <RoleBadge role={next} />
      </p>
      <p className="mt-3 mb-0 text-[14px] text-muted">
        {next === "valet"
          ? `${who.split(/[\s@]/)[0]} stops being a Steward: they come off the properties they lead and stay a valet wherever they're assigned.`
          : "Their property assignments stay the same, and they can now be chosen as a property's Steward."}{" "}
        To make someone an admin, the Super Admin uses Upgrade to Admin.
      </p>
      {save.error && (
        <div className="mt-3">
          <Alert>{errorMessage(save.error)}</Alert>
        </div>
      )}
    </Modal>
  );
}

/** Removing an admin also needs the Super Admin's passkey or authenticator. */
function RemoveAccessModal({ user, onClose, onDone }: { user: AdminUserRow; onClose: () => void; onDone: (message: string) => Promise<void> }) {
  const api = useApi();
  const stepUp = useStepUp();
  const needsStepUp = isAdminRole(user.role);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const who = user.name ?? user.email;
  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      const stepUpToken = needsStepUp ? await stepUp.confirm(code) : undefined;
      await api(`/admin/users/${user.id}/access`, { method: "DELETE", body: stepUpToken ? JSON.stringify({ stepUpToken }) : undefined });
      await onDone(`${who} can no longer sign in to the portal.`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Remove access"
      context={who}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Keep access
          </Button>
          <Button variant="danger" disabled={busy || (needsStepUp && !stepUp.method)} onClick={remove}>
            {busy ? "Removing…" : needsStepUp && stepUp.method === "passkey" ? "Confirm with passkey and remove" : "Remove access"}
          </Button>
        </>
      }
    >
      <p className="m-0 text-[15px] leading-relaxed">
        {who} loses every organization and property they can see, and the portal signs them out on their next click. Their past notes and reports stay.
      </p>
      {needsStepUp && (
        <div className="mt-4">
          <StepUpField stepUp={stepUp} code={code} onCode={setCode} />
        </div>
      )}
      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}
    </Modal>
  );
}

const ACTIONS: Record<string, string> = {
  "user.add_role": "added a role",
  "user.upgrade_admin": "made them an admin",
  "user.invite_admin": "invited them as an admin",
  "user.role": "changed their role",
  "user.reset_mfa": "reset their two-step verification",
  "user.remove_access": "removed their access",
  "user.restore": "turned their account back on",
  "invite.resend": "sent their invitation again",
  "invite.cancel": "cancelled their invitation",
  "invite.staff": "invited them",
  "report.update": "updated a report",
};

function ActivityDrawer({ user, onClose }: { user: AdminUserRow; onClose: () => void }) {
  const api = useApi();
  const target = user.id ?? user.email;
  const { data, error, isPending } = useQuery({
    queryKey: ["admin", "audit", "user", target],
    queryFn: () => api<{ items: AuditEntry[] }>(`/admin/audit?targetType=user&targetId=${encodeURIComponent(target)}`),
  });
  return (
    <Drawer title="Activity" context={user.name ?? user.email} onClose={onClose}>
      {isPending && <Loading />}
      {error && <Alert>{errorMessage(error)}</Alert>}
      {data && data.items.length === 0 && <p className="m-0 text-muted">No changes recorded for this person yet.</p>}
      {data && data.items.length > 0 && (
        <ol className="m-0 flex list-none flex-col gap-3.5 p-0">
          {data.items.map((a) => (
            <li key={a.id} className="flex gap-2.5">
              {a.actor ? <Avatar name={a.actor.name} seed={a.actor.id} size={30} /> : <span aria-hidden="true" className="size-[30px] flex-none rounded-full bg-neutral-bg" />}
              <p className="m-0 text-[14px]">
                <strong>{a.actor?.name ?? "CBES"}</strong> <span className="text-muted">{ACTIONS[a.action] ?? a.action}</span> <span className="text-[12px] text-muted">· {timeAgo(a.createdAt)}</span>
              </p>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-5 mb-0 text-[13px] text-muted">
        Notes and reports they wrote stay on each violation and report. <Link to="/admin/violations">Violations</Link> · <Link to="/admin/reports">Reports</Link>
      </p>
    </Drawer>
  );
}
