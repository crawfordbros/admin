import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError, errorMessage, useApi, type AdminPropertyDetail, type Property } from "../../lib/api";
import { CONTRACT_LABELS, PROPERTY_ROLE_LABELS } from "../../lib/format";
import { Alert, Button, ButtonLink, Card, Loading, SelectField, TextField } from "../../components/ui";
import { PropertyForm } from "./PropertyForm";
import { propertyPayload } from "./propertyPayload";

export function NewPropertyPage() {
  const api = useApi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  useEffect(() => {
    document.title = "Add a property | CBES Admin";
  }, []);

  return (
    <div className="mx-auto max-w-3xl">
      <p className="mt-0 mb-2 text-[15px]">
        <Link to="/admin/properties">Properties</Link>
      </p>
      <h1 className="mt-0 mb-6 text-3xl font-bold text-navy">Add a property</h1>
      <Card>
        <PropertyForm
          submitLabel="Add property"
          onSubmit={async (values) => {
            const { property } = await api<{ property: Property }>("/admin/properties", {
              method: "POST",
              body: JSON.stringify(propertyPayload(values)),
            });
            await queryClient.invalidateQueries({ queryKey: ["admin", "properties"] });
            navigate(`/admin/properties/${property.id}`);
          }}
        />
      </Card>
    </div>
  );
}

function Details({ property }: { property: Property }) {
  const rows: [string, string | number | null | undefined][] = [
    ["Address", [property.address, property.city].filter(Boolean).join(", ")],
    ["County", property.county],
    ["Units", property.unitCount],
    ["Management company", property.managementCompany],
    ["Service start", property.serviceStartDate],
    ["Contract", property.contractType ? CONTRACT_LABELS[property.contractType] : null],
    ["Connecteam job", property.connecteamJobId],
    ["Resident QR link", `/report?p=${property.slug}`],
  ];
  return (
    <dl className="m-0 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {rows.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-[13px] text-muted">{k}</dt>
          <dd className="m-0 break-words">{v || <span className="text-muted">Not set</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

function InviteForm({ propertyId, onDone }: { propertyId: string; onDone: (message: string) => void }) {
  const api = useApi();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    setSaving(true);
    setErrors({});
    setFormError(null);
    try {
      const res = await api<{ status: "invited" | "added" }>(`/admin/properties/${propertyId}/invitations`, {
        method: "POST",
        body: JSON.stringify(values),
      });
      form.reset();
      onDone(
        res.status === "added"
          ? `${values.email} already has an account, so they can see this property now.`
          : `Invitation sent to ${values.email}. They'll see this property after they accept it and sign in.`,
      );
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length) setErrors(err.fieldErrors);
      else setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <TextField label="Email" name="email" type="email" autoComplete="off" required error={errors.email} />
      <TextField label="Name" name="name" optional autoComplete="off" error={errors.name} />
      <SelectField label="Role" name="role" defaultValue="manager" error={errors.role}>
        {Object.entries(PROPERTY_ROLE_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </SelectField>
      <div className="flex items-end">
        <Button type="submit" disabled={saving} className="w-full">
          {saving ? "Sending…" : "Send invitation"}
        </Button>
      </div>
      {formError && (
        <div className="sm:col-span-2">
          <Alert>{formError}</Alert>
        </div>
      )}
    </form>
  );
}

export function PropertyAdminPage() {
  const { id = "" } = useParams();
  const api = useApi();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const key = ["admin", "property", id];
  const { data, error, isPending } = useQuery({ queryKey: key, queryFn: () => api<AdminPropertyDetail>(`/admin/properties/${id}`) });

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: key }),
      queryClient.invalidateQueries({ queryKey: ["admin", "properties"] }),
    ]);

  const remove = useMutation({
    mutationFn: (path: string) => api(path, { method: "DELETE" }),
    onSuccess: refresh,
  });

  useEffect(() => {
    if (data) document.title = `${data.property.name} | CBES Admin`;
  }, [data]);

  if (isPending) return <Loading />;
  if (error) return <Alert>{errorMessage(error)}</Alert>;
  const { property, members, invitations } = data;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <div>
        <p className="mt-0 mb-2 text-[15px]">
          <Link to="/admin/properties">Properties</Link>
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="m-0 text-3xl font-bold text-navy">{property.name}</h1>
          <ButtonLink to={`/portal/properties/${property.id}`} variant="outline" className="w-full sm:w-auto">
            See what managers see
          </ButtonLink>
        </div>
      </div>

      {notice && <Alert tone="success">{notice}</Alert>}

      <Card
        title="Details"
        action={
          !editing && (
            <Button variant="outline" onClick={() => setEditing(true)}>
              Edit
            </Button>
          )
        }
      >
        {editing ? (
          <PropertyForm
            initial={property}
            submitLabel="Save changes"
            onSubmit={async (values) => {
              await api(`/admin/properties/${property.id}`, { method: "PATCH", body: JSON.stringify(propertyPayload(values)) });
              await refresh();
              setEditing(false);
              setNotice("Property saved.");
            }}
          />
        ) : (
          <Details property={property} />
        )}
      </Card>

      <Card title="Property managers">
        {members.length === 0 && invitations.length === 0 && (
          <p className="mt-0 mb-4 text-muted">Nobody can see this property yet. Invite its manager below.</p>
        )}
        {(members.length > 0 || invitations.length > 0) && (
          <ul className="m-0 mb-6 flex list-none flex-col divide-y divide-line p-0">
            {members.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="m-0 font-semibold break-words">{m.name ?? m.email}</p>
                  <p className="m-0 text-[14px] break-words text-muted">
                    {m.name ? `${m.email} · ` : ""}
                    {PROPERTY_ROLE_LABELS[m.role]}
                  </p>
                </div>
                <Button
                  variant="danger"
                  disabled={remove.isPending}
                  onClick={() => {
                    if (window.confirm(`Remove ${m.name ?? m.email}'s access to ${property.name}?`)) {
                      setNotice(null);
                      remove.mutate(`/admin/properties/${property.id}/members/${m.id}`);
                    }
                  }}
                >
                  Remove access
                </Button>
              </li>
            ))}
            {invitations.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="m-0 font-semibold break-words">{i.name ?? i.email}</p>
                  <p className="m-0 text-[14px] break-words text-muted">
                    {i.name ? `${i.email} · ` : ""}
                    {PROPERTY_ROLE_LABELS[i.role]} · <span className="font-semibold text-gold-text">Invitation sent</span>
                  </p>
                </div>
                <Button
                  variant="outline"
                  disabled={remove.isPending}
                  onClick={() => {
                    setNotice(null);
                    remove.mutate(`/admin/properties/${property.id}/invitations/${i.id}`);
                  }}
                >
                  Cancel invitation
                </Button>
              </li>
            ))}
          </ul>
        )}
        {remove.error && (
          <div className="mb-4">
            <Alert>{errorMessage(remove.error)}</Alert>
          </div>
        )}
        <h3 className="mt-0 mb-3 text-lg">Invite a manager</h3>
        <InviteForm
          propertyId={property.id}
          onDone={async (message) => {
            setNotice(message);
            await refresh();
          }}
        />
      </Card>
    </div>
  );
}
