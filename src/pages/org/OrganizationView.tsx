import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ApiError, errorMessage, useApi, type InviteRole, type OrganizationDetail } from "../../lib/api";
import { INVITE_ROLE_LABELS, PROPERTY_ROLE_LABELS } from "../../lib/format";
import { Alert, Button, Card, Loading, SelectField, TextField } from "../../components/ui";

type Props = {
  id: string;
  /** Where property links go: the admin property page or the portal overview. */
  area: "admin" | "portal";
  /** Admins also rename the organization and add or remove representatives. */
  isAdmin: boolean;
};

/**
 * One organization: its properties, representatives, property staff and pending invitations, and
 * the form that invites people. CBES admins and the organization's representatives share it.
 */
export function OrganizationView({ id, area, isAdmin }: Props) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);
  const [addingProperty, setAddingProperty] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const key = ["organization", id];
  const { data, error, isPending } = useQuery({ queryKey: key, queryFn: () => api<OrganizationDetail>(`/organizations/${id}`) });

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: key }),
      queryClient.invalidateQueries({ queryKey: ["organizations"] }),
      queryClient.invalidateQueries({ queryKey: ["admin", "properties"] }),
      queryClient.invalidateQueries({ queryKey: ["me"] }),
    ]);
  const done = async (message: string) => {
    setNotice(message);
    await refresh();
  };

  const remove = useMutation({
    mutationFn: ({ path }: { path: string; message: string }) => api(path, { method: "DELETE" }),
    onSuccess: (_res, { message }) => done(message),
  });
  const removeAfterConfirm = (question: string, path: string, message: string) => {
    if (!window.confirm(question)) return;
    setNotice(null);
    remove.mutate({ path, message });
  };

  useEffect(() => {
    if (data) document.title = `${data.organization.name} | CBES ${area === "admin" ? "Admin" : "Portal"}`;
  }, [data, area]);

  if (isPending) return <Loading />;
  if (error) return <Alert>{errorMessage(error)}</Alert>;
  const { organization, properties, representatives, staff, invitations } = data;
  const base = `/organizations/${organization.id}`;
  const propertyLink = (propertyId: string) => (area === "admin" ? `/admin/properties/${propertyId}` : `/portal/properties/${propertyId}`);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <div>
        {area === "admin" && (
          <p className="mt-0 mb-2 text-[15px]">
            <Link to="/admin/organizations">Organizations</Link>
          </p>
        )}
        {renaming ? (
          <RenameForm
            id={organization.id}
            name={organization.name}
            onCancel={() => setRenaming(false)}
            onDone={async () => {
              setRenaming(false);
              await done("Organization renamed.");
            }}
          />
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="m-0 text-3xl font-bold text-navy">{organization.name}</h1>
            {isAdmin && (
              <Button variant="outline" onClick={() => setRenaming(true)}>
                Rename
              </Button>
            )}
          </div>
        )}
      </div>

      {notice && <Alert tone="success">{notice}</Alert>}
      {remove.error && <Alert>{errorMessage(remove.error)}</Alert>}

      <Card
        title="Properties"
        action={
          !addingProperty && (
            <Button variant="outline" onClick={() => setAddingProperty(true)}>
              Add a property
            </Button>
          )
        }
      >
        {addingProperty && (
          <div className="mb-5 rounded-lg border border-line p-4">
            <AddPropertyForm
              organizationId={organization.id}
              onCancel={() => setAddingProperty(false)}
              onDone={async (name) => {
                setAddingProperty(false);
                await done(`${name} added.`);
              }}
            />
          </div>
        )}
        {properties.length === 0 ? (
          <p className="m-0 text-muted">No properties yet. Add one to invite its managers.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col divide-y divide-line p-0">
            {properties.map((p) => (
              <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
                <div className="min-w-0">
                  <Link to={propertyLink(p.id)} className="font-semibold">
                    {p.name}
                  </Link>
                  <p className="m-0 text-[14px] text-muted">
                    {[p.city, p.unitCount ? `${p.unitCount} units` : null].filter(Boolean).join(", ") || "No details yet"}
                    {p.status !== "active" && " (inactive)"}
                  </p>
                </div>
                <span className="text-[14px] text-muted">
                  {p.openReports} open report{p.openReports === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Representatives">
        <p className="mt-0 mb-3 text-[15px] text-muted">Representatives see and manage every property in {organization.name}.</p>
        {representatives.length === 0 ? (
          <p className="m-0 text-muted">{isAdmin ? "No representatives yet. Invite one below." : "None yet."}</p>
        ) : (
          <People>
            {representatives.map((r) => (
              <Person key={r.id} name={r.name} email={r.email}>
                {isAdmin && (
                  <Button
                    variant="danger"
                    disabled={remove.isPending}
                    onClick={() =>
                      removeAfterConfirm(
                        `Remove ${r.name ?? r.email} as a representative of ${organization.name}?`,
                        `${base}/representatives/${r.id}`,
                        `${r.name ?? r.email} is no longer a representative.`,
                      )
                    }
                  >
                    Remove
                  </Button>
                )}
              </Person>
            ))}
          </People>
        )}
      </Card>

      <Card title="Property managers and Directors">
        {staff.length === 0 ? (
          <p className="m-0 text-muted">Nobody yet. Invite them below.</p>
        ) : (
          <People>
            {staff.map((s) => (
              <Person key={`${s.id}-${s.propertyId}`} name={s.name} email={s.email} detail={`${PROPERTY_ROLE_LABELS[s.role]} at ${s.propertyName}`}>
                <Button
                  variant="danger"
                  disabled={remove.isPending}
                  onClick={() =>
                    removeAfterConfirm(
                      `Remove ${s.name ?? s.email}'s access to ${s.propertyName}?`,
                      `${base}/properties/${s.propertyId}/members/${s.id}`,
                      `${s.name ?? s.email} can no longer see ${s.propertyName}.`,
                    )
                  }
                >
                  Remove access
                </Button>
              </Person>
            ))}
          </People>
        )}
      </Card>

      {invitations.length > 0 && (
        <Card title="Waiting to accept">
          <People>
            {invitations.map((i) => (
              <Person
                key={i.id}
                name={i.name}
                email={i.email}
                detail={i.propertyName ? `${INVITE_ROLE_LABELS[i.role]} at ${i.propertyName}` : `${INVITE_ROLE_LABELS[i.role]} of ${organization.name}`}
              >
                {(isAdmin || i.role !== "representative") && (
                  <Button
                    variant="outline"
                    disabled={remove.isPending}
                    onClick={() => {
                      setNotice(null);
                      remove.mutate({ path: `${base}/invitations/${i.id}`, message: `Invitation for ${i.email} cancelled.` });
                    }}
                  >
                    Cancel invitation
                  </Button>
                )}
              </Person>
            ))}
          </People>
        </Card>
      )}

      <Card title="Invite someone">
        <InviteForm organizationId={organization.id} properties={properties} isAdmin={isAdmin} onDone={done} />
      </Card>
    </div>
  );
}

function People({ children }: { children: ReactNode }) {
  return <ul className="m-0 flex list-none flex-col divide-y divide-line p-0">{children}</ul>;
}

function Person({ name, email, detail, children }: { name: string | null; email: string; detail?: string; children?: ReactNode }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="m-0 font-semibold break-words">{name ?? email}</p>
        <p className="m-0 text-[14px] break-words text-muted">{[name ? email : null, detail].filter(Boolean).join(", ")}</p>
      </div>
      {children}
    </li>
  );
}

/** Shared submit handling: field errors inline, anything else above the button. */
function useFormSubmit<T>(send: (values: FormData) => Promise<T>, after: (res: T, values: FormData, form: HTMLFormElement) => void | Promise<void>) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const values = new FormData(form);
    setSaving(true);
    setErrors({});
    setFormError(null);
    try {
      await after(await send(values), values, form);
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length) setErrors(err.fieldErrors);
      else setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }
  return { onSubmit, errors, formError, saving };
}

function InviteForm({
  organizationId,
  properties,
  isAdmin,
  onDone,
}: {
  organizationId: string;
  properties: OrganizationDetail["properties"];
  isAdmin: boolean;
  onDone: (message: string) => Promise<void>;
}) {
  const api = useApi();
  const [role, setRole] = useState<InviteRole>("manager");
  const roles = (Object.keys(INVITE_ROLE_LABELS) as InviteRole[]).filter((r) => isAdmin || r !== "representative");
  const forProperties = role !== "representative";

  const { onSubmit, errors, formError, saving } = useFormSubmit(
    (values) =>
      api<{ status: "invited" | "added" }>(`/organizations/${organizationId}/invitations`, {
        method: "POST",
        body: JSON.stringify({
          email: values.get("email"),
          name: values.get("name"),
          role,
          propertyIds: forProperties ? values.getAll("propertyIds") : [],
        }),
      }),
    async (res, values, form) => {
      form.reset();
      const email = String(values.get("email"));
      await onDone(
        res.status === "added"
          ? `${email} already has an account, so they have access now.`
          : `Invitation sent to ${email}. They'll have access after they accept it and sign in.`,
      );
    },
  );

  if (forProperties && properties.length === 0 && !isAdmin) {
    return <p className="m-0 text-muted">Add a property first, then invite its managers.</p>;
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <TextField label="Email" name="email" type="email" autoComplete="off" required error={errors.email} />
      <TextField label="Name" name="name" optional autoComplete="off" error={errors.name} />
      <SelectField
        label="Role"
        name="role"
        value={role}
        onChange={(e) => setRole(e.target.value as InviteRole)}
        error={errors.role}
        hint={role === "representative" ? "Sees and manages every property in this organization." : "Sees only the properties you choose."}
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
            <p className="m-0 text-[15px] text-muted">This organization has no properties yet. Add one above first.</p>
          ) : (
            <div className="flex flex-col gap-1">
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
      <div className="sm:col-span-2">
        <Button type="submit" disabled={saving || (forProperties && properties.length === 0)} className="w-full sm:w-auto">
          {saving ? "Sending…" : "Send invitation"}
        </Button>
      </div>
    </form>
  );
}

function AddPropertyForm({ organizationId, onCancel, onDone }: { organizationId: string; onCancel: () => void; onDone: (name: string) => Promise<void> }) {
  const api = useApi();
  const { onSubmit, errors, formError, saving } = useFormSubmit(
    (values) =>
      api<{ property: { name: string } }>(`/organizations/${organizationId}/properties`, {
        method: "POST",
        body: JSON.stringify(Object.fromEntries([...values.entries()].filter(([k, v]) => k === "name" || v !== ""))),
      }),
    (res) => onDone(res.property.name),
  );
  return (
    <form onSubmit={onSubmit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <TextField label="Property name" name="name" required error={errors.name} className="sm:col-span-2" />
      <TextField label="Street address" name="address" optional autoComplete="street-address" error={errors.address} className="sm:col-span-2" />
      <TextField label="City" name="city" optional error={errors.city} />
      <TextField label="County" name="county" optional error={errors.county} />
      <TextField label="Number of units" name="unitCount" type="number" inputMode="numeric" min={1} optional error={errors.unitCount} />
      {(formError || errors.slug) && (
        <div className="sm:col-span-2">
          <Alert>{formError ?? errors.slug}</Alert>
        </div>
      )}
      <div className="flex flex-wrap gap-3 sm:col-span-2">
        <Button type="submit" disabled={saving}>
          {saving ? "Adding…" : "Add property"}
        </Button>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function RenameForm({ id, name, onCancel, onDone }: { id: string; name: string; onCancel: () => void; onDone: () => Promise<void> }) {
  const api = useApi();
  const { onSubmit, errors, formError, saving } = useFormSubmit(
    (values) => api(`/organizations/${id}`, { method: "PATCH", body: JSON.stringify({ name: values.get("name") }) }),
    () => onDone(),
  );
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <TextField label="Organization name" name="name" required defaultValue={name} error={errors.name ?? formError ?? undefined} className="flex-1" />
      <div className="flex gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save name"}
        </Button>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
