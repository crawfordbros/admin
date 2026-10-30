import { validatePropertyAddress } from "../../lib/propertyAddress";
import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { ApiError, errorMessage, useApi, type OrganizationRow, type Property } from "../../lib/api";
import { CONTRACT_LABELS } from "../../lib/format";
import { Alert, Button, SelectField, TextField } from "../../components/ui";
import type { PropertyFormValues } from "./propertyPayload";

/** Add and edit share this form. `onSubmit` throws ApiError with fieldErrors on a 422. */
export function PropertyForm({
  initial,
  submitLabel,
  onSubmit,
}: {
  initial?: Property;
  submitLabel: string;
  onSubmit: (values: PropertyFormValues) => Promise<void>;
}) {
  const api = useApi();
  const organizations = useQuery({
    queryKey: ["organizations"],
    queryFn: () => api<{ organizations: OrganizationRow[] }>("/organizations"),
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.currentTarget)) as PropertyFormValues;
    const found = validatePropertyAddress(values);
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    setErrors({});
    setFormError(null);
    try {
      await onSubmit(values);
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length) setErrors(err.fieldErrors);
      else setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <TextField label="Property name" name="name" required defaultValue={initial?.name} error={errors.name} className="sm:col-span-2" />
      <TextField label="Street address" hint="Required" name="address" required autoComplete="street-address" defaultValue={initial?.address ?? ""} error={errors.address} className="sm:col-span-2" />
      <TextField label="City" hint="Required" name="city" required defaultValue={initial?.city ?? ""} error={errors.city} />
      <TextField label="ZIP" hint="Required" name="zip" required autoComplete="postal-code" defaultValue={initial?.zip ?? ""} error={errors.zip} />
      <TextField label="County" name="county" optional defaultValue={initial?.county ?? ""} error={errors.county} />
      <TextField label="Number of units" name="unitCount" type="number" inputMode="numeric" min={1} optional defaultValue={initial?.unitCount ?? ""} error={errors.unitCount} />
      <SelectField
        // Remount once the list arrives so the saved organization is selected.
        key={organizations.data ? "loaded" : "loading"}
        label="Organization"
        name="organizationId"
        defaultValue={initial?.organizationId ?? ""}
        error={errors.organizationId ?? (organizations.error ? errorMessage(organizations.error) : undefined)}
        hint="The management company. Its representatives see and manage this property."
      >
        <option value="">Not assigned yet</option>
        {organizations.data?.organizations.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </SelectField>
      <TextField label="Service start date" name="serviceStartDate" type="date" optional defaultValue={initial?.serviceStartDate ?? ""} error={errors.serviceStartDate} />
      <SelectField label="Contract" name="contractType" optional defaultValue={initial?.contractType ?? ""} error={errors.contractType}>
        <option value="">Not set</option>
        {Object.entries(CONTRACT_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </SelectField>
      <TextField
        label="Connecteam job ID"
        name="connecteamJobId"
        optional
        defaultValue={initial?.connecteamJobId ?? ""}
        error={errors.connecteamJobId}
        hint="The job valets clock in to at this property. The weekly report uses it for clock-in and clock-out times."
      />
      <TextField
        label="Web address"
        name="slug"
        optional
        defaultValue={initial?.slug ?? ""}
        error={errors.slug}
        hint="Used in resident QR codes (/report?p=…). Leave blank to make one from the name."
      />
      {initial && (
        <SelectField label="Status" name="status" defaultValue={initial.status} error={errors.status}>
          <option value="active">Active</option>
          <option value="inactive">Inactive (hidden from the resident form)</option>
        </SelectField>
      )}
      {formError && (
        <div className="sm:col-span-2">
          <Alert>{formError}</Alert>
        </div>
      )}
      <div className="sm:col-span-2">
        <Button type="submit" disabled={saving} className="w-full sm:w-auto">
          {saving ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
