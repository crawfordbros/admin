import { useEffect, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ApiError, errorMessage, useApi, type Property, type PropertyOverview } from "../../lib/api";
import { CONTRACT_LABELS, formatDate } from "../../lib/format";
import { Alert, Button, ButtonLink, Card, Loading, Stat, TextField } from "../../components/ui";
import { PropertyViolations } from "../violations/PortalViolations";

/** A property manager's home: their property's details and resident reports. Representatives can edit the basics. */
export function PropertyPage() {
  const { id = "" } = useParams();
  const api = useApi();
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const { data, error, isPending } = useQuery({
    queryKey: ["portal", "property", id],
    queryFn: () => api<PropertyOverview>(`/portal/properties/${id}`),
  });
  useEffect(() => {
    if (data) document.title = `${data.property.name} | CBES Portal`;
  }, [data]);

  if (isPending) return <Loading />;
  if (error) return <Alert>{errorMessage(error)}</Alert>;
  const { property, canManage, openReports, recentReports, buildings, units } = data;

  const details: [string, string | number | null][] = [
    ["Address", [property.address, property.city].filter(Boolean).join(", ") || null],
    ["County", property.county],
    ["Units", property.unitCount],
    ["Organization", property.organizationName],
    ["Service started", property.serviceStartDate],
    ["Contract", property.contractType ? CONTRACT_LABELS[property.contractType] : null],
  ];

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="mt-0 mb-1 text-sm font-semibold text-gold-text">
            {canManage && property.organizationId ? (
              <Link to={`/portal/organizations/${property.organizationId}`}>{property.organizationName}</Link>
            ) : (
              "Your property"
            )}
          </p>
          <h1 className="m-0 text-3xl font-bold text-navy">{property.name}</h1>
        </div>
        <ButtonLink to={`/portal/properties/${property.id}/report`} className="w-full sm:w-auto">
          Weekly report
        </ButtonLink>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat value={openReports} label="Open resident reports" />
        <Stat value={buildings || "—"} label="Buildings" />
        <Stat value={units || property.unitCount || "—"} label="Units" />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex min-w-0 flex-col gap-5">
        <Card title="Latest resident reports">
          {recentReports.length === 0 ? (
            <p className="m-0 text-muted">No resident reports yet.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col divide-y divide-line p-0">
              {recentReports.map((r) => (
                <li key={r.refNo} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
                  <div className="min-w-0">
                    <p className="m-0 font-semibold">
                      #{r.refNo} · {r.issueLabel}
                    </p>
                    <p className="m-0 text-[14px] text-muted">
                      {formatDate(r.createdAt)}
                      {r.unit ? ` · ${r.unit}` : ""}
                    </p>
                  </div>
                  <span className="rounded-full bg-tint px-2.5 py-0.5 text-[13px] font-semibold text-navy">{r.statusLabel}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <PropertyViolations propertyId={property.id} />
        </div>

        <Card
          title="Property details"
          action={
            canManage &&
            !editing && (
              <Button
                variant="outline"
                onClick={() => {
                  setSaved(false);
                  setEditing(true);
                }}
              >
                Edit
              </Button>
            )
          }
        >
          {saved && (
            <div className="mb-4">
              <Alert tone="success">Details saved.</Alert>
            </div>
          )}
          {editing ? (
            <EditDetails
              property={property}
              onCancel={() => setEditing(false)}
              onSaved={() => {
                setEditing(false);
                setSaved(true);
              }}
            />
          ) : (
            <dl className="m-0 flex flex-col gap-3">
              {details.map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[13px] text-muted">{k}</dt>
                  <dd className="m-0">{v ?? <span className="text-muted">Not set</span>}</dd>
                </div>
              ))}
            </dl>
          )}
          <p className="mt-5 mb-0 text-[14px] text-muted">
            {canManage ? "To change the contract or service details, email " : "Something out of date? Email "}
            <a href="mailto:office@cbenvironments.com">office@cbenvironments.com</a>.
          </p>
        </Card>
      </div>
    </div>
  );
}

/** The basics a representative keeps up to date. CBES keeps the contract and service details. */
function EditDetails({ property, onCancel, onSaved }: { property: Property; onCancel: () => void; onSaved: () => void }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.currentTarget));
    setSaving(true);
    setErrors({});
    setFormError(null);
    try {
      await api(`/portal/properties/${property.id}`, { method: "PATCH", body: JSON.stringify(values) });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["portal", "property", property.id] }),
        queryClient.invalidateQueries({ queryKey: ["me"] }),
        queryClient.invalidateQueries({ queryKey: ["organization"] }),
      ]);
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length) setErrors(err.fieldErrors);
      else setFormError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <TextField label="Property name" name="name" required defaultValue={property.name} error={errors.name} />
      <TextField label="Street address" name="address" optional autoComplete="street-address" defaultValue={property.address ?? ""} error={errors.address} />
      <TextField label="City" name="city" optional defaultValue={property.city ?? ""} error={errors.city} />
      <TextField label="County" name="county" optional defaultValue={property.county ?? ""} error={errors.county} />
      <TextField label="Number of units" name="unitCount" type="number" inputMode="numeric" min={1} optional defaultValue={property.unitCount ?? ""} error={errors.unitCount} />
      {formError && <Alert>{formError}</Alert>}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save details"}
        </Button>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
