import { useEffect, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ApiError, errorMessage, useApi, type Property, type PropertyOverview, type WeeklyReport } from "../../lib/api";
import { CONTRACT_LABELS, PROPERTY_ROLE_LABELS, formatCount, formatDate } from "../../lib/format";
import { MANAGER_PREVIEW_DENIED, useManagerPreview } from "../../lib/preview";
import { Alert, Button, ButtonLink, Card, Loading, TextField } from "../../components/ui";
import { Avatar, Pill, StatTile } from "../../components/display";
import { Icon } from "../../components/icons";
import { propertyPath } from "../admin/paths";
import { PropertyViolations } from "../violations/PortalViolations";

/** A property manager's home: their property's details and resident reports. Representatives can edit the basics. */
export function PropertyPage() {
  const { id = "" } = useParams();
  const api = useApi();
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const preview = useManagerPreview();
  const { data, error, isPending } = useQuery({
    queryKey: ["portal", "property", id, preview.query],
    queryFn: () => api<PropertyOverview>(`/portal/properties/${id}${preview.query}`),
    enabled: !preview.denied,
  });
  // Last week's report, for nights serviced and the average clock-in.
  const week = useQuery({
    queryKey: ["portal", "report", id, ""],
    queryFn: () => api<WeeklyReport>(`/portal/properties/${id}/report`),
    retry: false,
    enabled: !preview.denied,
  });
  useEffect(() => {
    if (data) document.title = `${data.property.name} | CBES Portal`;
  }, [data]);

  if (preview.denied) return <Alert>{MANAGER_PREVIEW_DENIED}</Alert>;
  if (isPending) return <Loading />;
  if (error) return <Alert>{errorMessage(error)}</Alert>;
  const { property, openReports, recentReports, buildings, units, team, stats } = data;
  const canManage = data.canManage && !preview.on;
  const valet = week.data?.valetTimes;

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
      {preview.on && (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-info/30 bg-info-bg px-4 py-3 text-[14px] text-info">
          <Icon name="eye" size={18} />
          <span className="min-w-0 flex-1">
            <strong>Previewing what property managers see.</strong> Internal violations and CBES-only notes are hidden, and changes are turned off.
          </span>
          <Link to={propertyPath(property.organizationId, property.id)} className="font-bold text-info">
            Back to admin view
          </Link>
        </div>
      )}
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

      <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
        <StatTile
          label="Nights serviced"
          value={valet?.status === "ok" ? valet.nights.length : "—"}
          sub={valet && valet.status !== "ok" ? "Not linked to Connecteam yet" : (week.data?.week.label ?? "Last week")}
        />
        <StatTile label="Avg valet clock-in" value={valet?.status === "ok" ? (valet.avgClockIn ?? "—") : "—"} sub="From Connecteam" />
        <StatTile label="Open resident reports" value={openReports} sub={`${formatCount(units || property.unitCount || 0)} units · ${buildings || "—"} buildings`} />
        {stats && (
          <StatTile
            label="Violations, 30 days"
            value={stats.violations30d}
            sub={stats.violationsPer100Units === null ? "Sent to the property" : `${stats.violationsPer100Units} per 100 units`}
          />
        )}
        {stats && <StatTile label="Units at threshold" value={stats.overwatchUnits} sub="Overwatch in Phase 2" />}
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
        <PropertyViolations propertyId={property.id} preview={preview.on} />
        </div>

        <div className="flex min-w-0 flex-col gap-5">

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
        {team && <TeamCard team={team} />}
        {stats && <OverwatchCard stats={stats} />}
        </div>
      </div>
    </div>
  );
}

/** Who services the property (CBES) and who manages it, read only (ADMIN_PORTAL_SPEC 7.10). */
function TeamCard({ team }: { team: NonNullable<PropertyOverview["team"]> }) {
  const person = (p: { id: string; name: string }, role: string) => (
    <li key={`${role}:${p.id}`} className="flex items-center gap-2.5">
      <Avatar name={p.name} seed={p.id} size={30} />
      <span className="min-w-0">
        <span className="block truncate text-[14px] font-semibold">{p.name}</span>
        <span className="block text-[12.5px] text-muted">{role}</span>
      </span>
    </li>
  );
  return (
    <Card title="Team">
      <h3 className="mt-0 mb-2 text-[13px] font-bold text-muted">CBES</h3>
      {team.steward || team.valets.length ? (
        <ul className="m-0 mb-4 flex list-none flex-col gap-2.5 p-0">
          {team.steward && person(team.steward, "Steward")}
          {team.valets.map((v) => person(v, "Valet"))}
        </ul>
      ) : (
        <p className="mt-0 mb-4 text-[14px] text-muted">CBES hasn't assigned a team yet.</p>
      )}
      <h3 className="mt-0 mb-2 text-[13px] font-bold text-muted">Property staff</h3>
      {team.staff.length ? (
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">{team.staff.map((s) => person(s, PROPERTY_ROLE_LABELS[s.role]))}</ul>
      ) : (
        <p className="m-0 text-[14px] text-muted">No property staff yet.</p>
      )}
    </Card>
  );
}

function OverwatchCard({ stats }: { stats: NonNullable<PropertyOverview["stats"]> }) {
  const n = stats.overwatchUnits;
  return (
    <section className="rounded-xl border border-dashed border-field bg-subtle p-5">
      <h2 className="m-0 flex flex-wrap items-center gap-2 text-lg text-ink">
        Overwatch <Pill tone="gold">Phase 2</Pill>
      </h2>
      <p className="mt-1.5 mb-3 text-[14px] leading-relaxed text-muted">
        {n ? `${n} unit${n === 1 ? " has" : "s have"}` : "No unit has"} {stats.overwatchThreshold.count} or more violations in the last {stats.overwatchThreshold.days} days. Overwatch cases
        for following up with those residents arrive in Phase 2.
      </p>
      <button type="button" disabled className="min-h-11 cursor-not-allowed rounded-lg border border-line bg-white px-4 text-[14px] font-bold text-placeholder">
        Create Overwatch case
      </button>
    </section>
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
