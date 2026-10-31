import type { PropertyReference } from "../../../lib/propertyAddress";
import { PropertyNames } from "../../../components/PropertyAddress";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { DataTable, type Column } from "../../../components/DataTable";
import { SearchField } from "../../../components/FilterBar";
import { Switch } from "../../../components/controls";
import { Avatar, Pill } from "../../../components/display";
import { Modal } from "../../../components/overlay";
import { PropertyChips } from "../../../components/portal/PropertyChips";
import { settingsCard } from "../../../components/portal/account";
import { useToast } from "../../../components/Toast";
import { Alert, Button } from "../../../components/ui";
import { ApiError } from "../../../lib/authenticatedRequest";
import { errorMessage, useApi, type TeamInvitation, type TeamMember } from "../../../lib/api";
import { PROPERTY_ROLE_LABELS, timeAgo } from "../../../lib/format";

const DAY_MS = 86_400_000;
const roleLabel = (role: TeamMember["role"]) => (role === "representative" ? "Representative" : PROPERTY_ROLE_LABELS[role]);
const smallButton = "h-8 rounded-lg border border-field bg-white px-2.5 text-[12.5px] font-bold text-navy hover:bg-canvas disabled:opacity-60";

/** "Expires in 5 days" until the 7-day link runs out, then "Expired". */
function inviteStatus(createdAt: string, now = Date.now()): { label: string; expired: boolean } {
  const left = Math.ceil((Date.parse(createdAt) + 7 * DAY_MS - now) / DAY_MS);
  if (left <= 0) return { label: "Expired", expired: true };
  return { label: `Expires in ${left} ${left === 1 ? "day" : "days"}`, expired: false };
}

function RoleBadge({ role }: { role: TeamMember["role"] }) {
  return <Pill tone={role === "representative" ? "gold" : "neutral"}>{roleLabel(role)}</Pill>;
}

export function PendingInvitations({ orgId, invitations, onChanged, standalone }: { orgId: string; invitations: TeamInvitation[]; onChanged: () => Promise<unknown>; standalone?: boolean }) {
  const api = useApi();
  const toast = useToast();
  const [revoking, setRevoking] = useState<TeamInvitation | null>(null);
  const resend = useMutation({
    mutationFn: (inv: TeamInvitation) => api(`/organizations/${orgId}/invitations/${inv.id}/resend`, { method: "POST" }),
    onSuccess: async (_r, inv) => {
      toast.success(`Invitation sent again to ${inv.email}.`);
      await onChanged();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const revoke = useMutation({
    mutationFn: (inv: TeamInvitation) => api(`/organizations/${orgId}/invitations/${inv.id}?everyProperty=1`, { method: "DELETE" }),
    onSuccess: async (_r, inv) => {
      setRevoking(null);
      toast.success(`Invitation to ${inv.email} revoked.`);
      await onChanged();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (!invitations.length && !standalone) return null;

  const columns: Column<TeamInvitation>[] = [
    {
      key: "email",
      header: "Email",
      cell: (i) => (
        <span className="block min-w-0 max-w-[240px]" title={i.email}>
          <span className="block truncate font-bold text-ink">{i.email}</span>
          {i.name && <span className="block truncate text-[12.5px] text-muted">{i.name}</span>}
        </span>
      ),
    },
    { key: "role", header: "Role", cell: (i) => roleLabel(i.role) },
    { key: "properties", header: "Properties", cell: (i) => (i.role === "representative" ? "All properties" : <PropertyNames properties={i.properties} />) },
    {
      key: "status",
      header: "Status",
      cell: (i) => {
        const s = inviteStatus(i.createdAt);
        return <Pill tone={s.expired ? "danger" : "warning"}>{s.label}</Pill>;
      },
    },
    {
      key: "actions",
      header: "",
      srHeader: "Actions",
      className: "text-right whitespace-nowrap",
      cell: (i) =>
        i.role === "representative" ? null : (
          <span className="inline-flex gap-1.5">
            <button type="button" className={smallButton} disabled={resend.isPending} onClick={() => resend.mutate(i)} aria-label={`Resend the invitation to ${i.email}`}>
              Resend
            </button>
            <button type="button" className={`${smallButton} text-danger`} onClick={() => setRevoking(i)} aria-label={`Revoke the invitation to ${i.email}`}>
              Revoke
            </button>
          </span>
        ),
    },
  ];

  return (
    <section aria-labelledby="waiting-title" className={settingsCard}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="waiting-title" className="m-0 text-[17px] text-navy-ink">
          Waiting to accept
        </h2>
        <span className="text-[13px] text-muted">
          {invitations.length} {invitations.length === 1 ? "invitation" : "invitations"}
        </span>
      </div>
      <DataTable
        label="Invitations waiting to be accepted"
        columns={columns}
        rows={invitations}
        rowKey={(i) => i.id}
        minWidth={640}
        empty={<p className="m-0 py-6 text-center text-[14px] text-muted">Nobody is waiting to accept. Invite a manager from the Team tab.</p>}
      />
      {revoking && (
        <Modal
          title="Revoke invitation"
          onClose={() => setRevoking(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setRevoking(null)}>
                Keep it
              </Button>
              <Button variant="danger" disabled={revoke.isPending} onClick={() => revoke.mutate(revoking)}>
                {revoke.isPending ? "Revoking…" : "Revoke"}
              </Button>
            </>
          }
        >
          <p className="m-0 text-[15px] leading-relaxed">
            The link in {revoking.email}'s email will stop working. You can invite them again later.
          </p>
        </Modal>
      )}
    </section>
  );
}

export function YourTeam({ orgId, orgName, team, properties, onChanged }: { orgId: string; orgName: string; team: TeamMember[]; properties: PropertyReference[]; onChanged: () => Promise<unknown> }) {
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const needle = q.trim().toLowerCase();
  const rows = needle ? team.filter((m) => `${m.name ?? ""} ${m.email}`.toLowerCase().includes(needle)) : team;

  const columns: Column<TeamMember>[] = [
    {
      key: "person",
      header: "Person",
      cell: (m) => (
        <span className="flex min-w-0 items-center gap-2.5">
          <Avatar name={m.name ?? m.email} seed={m.id} size={34} />
          <span className="min-w-0 max-w-[160px]" title={m.email}>
            <span className="block truncate font-bold text-ink">
              {m.name ?? m.email}
              {m.you && <span className="font-normal text-muted"> (you)</span>}
            </span>
            <span className="block truncate text-[12.5px] text-muted">{m.email}</span>
          </span>
        </span>
      ),
    },
    { key: "role", header: "Role", cell: (m) => <RoleBadge role={m.role} /> },
    {
      key: "properties",
      header: "Properties",
      cell: (m) => <span className="block min-w-[130px] text-[13.5px]">{m.properties === "all" ? "All properties" : <PropertyNames properties={m.properties} />}</span>,
    },
    { key: "weekly", header: "Weekly report", className: "whitespace-nowrap", cell: (m) => (m.receivesWeeklyReport ? "Yes" : "No") },
    { key: "last", header: "Last active", className: "whitespace-nowrap", cell: (m) => (m.lastSeenAt ? timeAgo(m.lastSeenAt) : <span className="text-muted">Not yet</span>) },
    {
      key: "actions",
      header: "",
      srHeader: "Actions",
      className: "text-right whitespace-nowrap",
      cell: (m) =>
        m.you ? (
          <Link to="/portal/settings" className={`${smallButton} inline-flex items-center no-underline`}>
            Profile
          </Link>
        ) : m.role === "representative" ? null : (
          <button type="button" className={smallButton} onClick={() => setEditing(m)} aria-label={`Edit access for ${m.name ?? m.email}`}>
            Edit access
          </button>
        ),
    },
  ];

  return (
    <section aria-labelledby="team-title" className={settingsCard}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 id="team-title" className="m-0 text-[17px] text-navy-ink">
          Your team
        </h2>
        <div className="flex w-full max-w-[280px]">
          <SearchField label="Search team" placeholder="Search team" value={q} onChange={setQ} />
        </div>
      </div>
      <DataTable
        label="Your team"
        columns={columns}
        rows={rows}
        rowKey={(m) => m.id}
        minWidth={680}
        empty={<p className="m-0 py-6 text-center text-[14px] text-muted">{needle ? "Nobody on your team matches that search." : "Nobody on your team yet. Invite a manager above."}</p>}
      />
      {editing && <EditAccessModal orgId={orgId} orgName={orgName} member={editing} properties={properties} onClose={() => setEditing(null)} onChanged={onChanged} />}
    </section>
  );
}

function EditAccessModal({
  orgId,
  orgName,
  member,
  properties,
  onClose,
  onChanged,
}: {
  orgId: string;
  orgName: string;
  member: TeamMember;
  properties: PropertyReference[];
  onClose: () => void;
  onChanged: () => Promise<unknown>;
}) {
  const api = useApi();
  const toast = useToast();
  const [propertyIds, setPropertyIds] = useState(member.properties === "all" ? [] : member.properties.map((p) => p.id));
  const [weekly, setWeekly] = useState(member.receivesWeeklyReport);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const who = member.name ?? member.email;

  const save = useMutation({
    mutationFn: () => api(`/organizations/${orgId}/team/${member.id}`, { method: "PATCH", body: JSON.stringify({ propertyIds, receivesWeeklyReport: weekly }) }),
    onSuccess: async () => {
      toast.success(`Access updated for ${who}.`);
      await onChanged();
      onClose();
    },
    onError: (err) => setError(err instanceof ApiError && err.fieldErrors.propertyIds ? err.fieldErrors.propertyIds : errorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: () => api(`/organizations/${orgId}/team/${member.id}`, { method: "DELETE" }),
    onSuccess: async () => {
      toast.success(`${who} was removed from ${orgName}.`);
      await onChanged();
      onClose();
    },
    onError: (err) => setError(errorMessage(err)),
  });

  if (confirmRemove) {
    return (
      <Modal
        title={`Remove ${who}?`}
        onClose={() => setConfirmRemove(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmRemove(false)}>
              Keep access
            </Button>
            <Button variant="danger" disabled={remove.isPending} onClick={() => remove.mutate()}>
              {remove.isPending ? "Removing…" : "Remove"}
            </Button>
          </>
        }
      >
        {error && <Alert>{error}</Alert>}
        <p className="m-0 text-[15px] leading-relaxed">
          {who} will lose access to every {orgName} property. If they have no other properties, they won't be able to sign in. You can invite them again later.
        </p>
      </Modal>
    );
  }

  return (
    <Modal
      title="Edit access"
      context={`${who} · ${member.email}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={save.isPending}
            onClick={() => {
              if (!propertyIds.length) return setError("Choose at least one property");
              setError(null);
              save.mutate();
            }}
          >
            {save.isPending ? "Saving…" : "Save access"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && <Alert>{error}</Alert>}
        <p className="m-0 text-[14px]">
          <span className="font-bold">Role:</span> {roleLabel(member.role)}
        </p>
        <PropertyChips properties={properties} value={propertyIds} onChange={setPropertyIds} />
        <div className="flex items-center justify-between gap-4 rounded-xl border border-line px-3.5 py-3">
          <span>
            <span className="block text-[14px] font-bold text-ink">Monday weekly report</span>
            <span className="block text-[12.5px] text-muted">7 AM ET, for the properties above</span>
          </span>
          <Switch label="Monday weekly report" checked={weekly} onChange={setWeekly} />
        </div>
        <button type="button" onClick={() => setConfirmRemove(true)} className="self-start border-0 bg-transparent p-0 text-[13.5px] font-bold text-danger underline-offset-2 hover:underline">
          Remove from {orgName}
        </button>
      </div>
    </Modal>
  );
}
