import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ROLE_LABELS, isAdmin, type Role } from "../../access";
import { ApiError, errorMessage, useApi, type AdminPropertyRow, type AdminUserRow, type OrganizationRow } from "../../lib/api";
import { useStepUp } from "../../lib/stepUp";
import { Alert, Button, Loading, SelectField } from "../../components/ui";
import { Modal } from "../../components/overlay";
import { StepUpField } from "./StepUp";

export function AddRoleModal({ user, actorRole, onClose, onDone }: {
  user: AdminUserRow;
  actorRole: Role;
  onClose: () => void;
  onDone: (message: string) => Promise<void>;
}) {
  const api = useApi();
  const stepUp = useStepUp();
  const [role, setRole] = useState<Role | "">("");
  const [organizationId, setOrganizationId] = useState(user.orgId ?? "");
  const [propertyIds, setPropertyIds] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [understood, setUnderstood] = useState(false);
  const who = user.name ?? user.email;
  const fieldRole = role === "lead" || role === "valet";
  const orgRole = role === "representative" || role === "director" || role === "manager";
  const needsProperties = role === "director" || role === "manager" || role === "valet";
  const showProperties = fieldRole || (orgRole && role !== "representative");
  const elevated = isAdmin(role || null);
  const cbes = isAdmin(user.role) || user.role === "lead" || user.role === "valet";
  const choices: Role[] = [
    ...(actorRole === "super_admin" && user.role !== "super_admin" ? ["super_admin" as const] : []),
    ...(actorRole === "super_admin" && !isAdmin(user.role) ? ["admin" as const] : []),
    ...(cbes ? ["lead" as const, "valet" as const] : []),
    ...(!cbes || isAdmin(user.role) ? ["representative" as const, "director" as const, "manager" as const] : []),
  ];
  const organizations = useQuery({
    queryKey: ["organizations"],
    queryFn: () => api<{ organizations: OrganizationRow[] }>("/organizations"),
    enabled: orgRole,
  });
  const properties = useQuery({
    queryKey: ["admin", "properties"],
    queryFn: () => api<{ properties: AdminPropertyRow[] }>("/admin/properties"),
    enabled: showProperties,
  });
  const available = (properties.data?.properties ?? []).filter((p) => p.status === "active" && (!orgRole || p.organizationId === organizationId));
  const ready = Boolean(role)
    && (!orgRole || Boolean(organizationId))
    && (!needsProperties || propertyIds.length > 0)
    && (!elevated || (understood && Boolean(stepUp.method)))
    && !(orgRole && (organizations.isPending || organizations.isError))
    && !(showProperties && (properties.isPending || properties.isError));
  const save = useMutation({
    mutationFn: async () => api(`/admin/users/${user.id}/roles`, {
      method: "POST",
      body: JSON.stringify({
        role,
        ...(orgRole ? { organizationId } : {}),
        propertyIds: showProperties ? propertyIds : [],
        ...(elevated ? { stepUpToken: await stepUp.confirm(code) } : {}),
      }),
    }),
    onSuccess: () => onDone(`${ROLE_LABELS[role as Role]} access added for ${who}.`),
  });
  const errors = save.error instanceof ApiError ? save.error.fieldErrors : {};
  const close = () => { if (!save.isPending) onClose(); };

  return (
    <Modal title="Add role" context={who} onClose={close} footer={
      <>
        <Button variant="secondary" onClick={onClose} disabled={save.isPending}>Cancel</Button>
        <Button disabled={!ready || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? "Saving…" : elevated ? "Confirm and add role" : "Add role"}
        </Button>
      </>
    }>
      <div className="flex flex-col gap-4">
        <p className="m-0 text-sm text-muted">Add a role and choose where it applies. Existing roles and property assignments are kept.</p>
        <SelectField label="Role to add" value={role} error={errors.role} onChange={(e) => {
          setRole(e.target.value as Role | "");
          setPropertyIds([]);
          setUnderstood(false);
          save.reset();
        }} disabled={save.isPending}>
          <option value="">Choose a role</option>
          {choices.map((choice) => <option key={choice} value={choice}>{ROLE_LABELS[choice]}</option>)}
        </SelectField>
        {orgRole && (
          <SelectField label="Organization" value={organizationId} error={errors.organizationId} onChange={(e) => { setOrganizationId(e.target.value); setPropertyIds([]); }} disabled={save.isPending || organizations.isPending}>
            <option value="">Choose an organization</option>
            {(organizations.data?.organizations ?? []).filter((o) => o.status !== "inactive").map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </SelectField>
        )}
        {role === "representative" && <p className="m-0 text-sm text-muted">Representatives can manage every property in the selected organization.</p>}
        {showProperties && (
          <fieldset disabled={save.isPending} className="m-0 min-w-0 border-0 p-0">
            <legend className="mb-2 text-sm font-semibold">Properties{role === "lead" ? " (optional)" : ""}</legend>
            {properties.isPending ? <Loading /> : (
              <div className="flex max-h-56 flex-col gap-1 overflow-y-auto rounded-lg border border-line p-2">
                {available.map((p) => (
                  <label key={p.id} className="flex min-h-10 cursor-pointer items-center gap-3 rounded-md px-2 hover:bg-tint">
                    <input type="checkbox" className="size-5 accent-navy" checked={propertyIds.includes(p.id)} onChange={(e) => setPropertyIds((ids) => e.target.checked ? [...ids, p.id] : ids.filter((id) => id !== p.id))} />
                    {p.name}
                  </label>
                ))}
                {!available.length && <p className="m-0 p-2 text-sm text-muted">{orgRole && !organizationId ? "Choose an organization to see its properties." : "No active properties available."}</p>}
              </div>
            )}
            {errors.propertyIds && <p role="alert" className="mt-2 text-sm text-danger">{errors.propertyIds}</p>}
          </fieldset>
        )}
        {elevated && (
          <>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-navy" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} disabled={save.isPending} />
              <span>I understand {who} will have access to every organization and property{role === "super_admin" ? ", and can grant Admin and Super Admin access" : ""}.</span>
            </label>
            <StepUpField stepUp={stepUp} code={code} onCode={setCode} notice="This role change is recorded in activity." />
          </>
        )}
        {orgRole && organizations.error && <Alert>{errorMessage(organizations.error)}</Alert>}
        {showProperties && properties.error && <Alert>{errorMessage(properties.error)}</Alert>}
        {save.error && <Alert>{errorMessage(save.error)}</Alert>}
      </div>
    </Modal>
  );
}
