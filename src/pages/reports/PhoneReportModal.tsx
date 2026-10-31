import { propertyOptionLabel } from "../../lib/propertyAddress";
import { useState } from "react";
import { useApi, type AdminPropertyRow } from "../../lib/api";
import { nyToday } from "../../lib/format";
import { useFormSubmit } from "../../lib/useFormSubmit";
import { Alert, Button, SelectField, TextField } from "../../components/ui";
import { SegmentedControl } from "../../components/controls";
import { Modal } from "../../components/overlay";

/**
 * A report a resident phoned in, logged by CBES with the same fields as the public form. The
 * resident gets the usual confirmation email only when an email address is entered.
 */
export function PhoneReportModal({
  properties,
  types,
  onClose,
  onDone,
}: {
  properties: AdminPropertyRow[];
  types: { value: string; label: string }[];
  onClose: () => void;
  onDone: (id: string, refNo: number) => Promise<void>;
}) {
  const api = useApi();
  const [method, setMethod] = useState<"phone" | "email">("phone");
  const { onSubmit, errors, formError, saving } = useFormSubmit(
    (v) =>
      api<{ report: { id: string; refNo: number } }>("/admin/reports", {
        method: "POST",
        body: JSON.stringify({
          propertyId: v.get("propertyId"),
          building: v.get("building") || undefined,
          unit: v.get("unit") || undefined,
          issueType: v.get("issueType"),
          issueDate: v.get("issueDate") || undefined,
          description: v.get("description") || undefined,
          reporterName: v.get("reporterName"),
          reporterContact: v.get("reporterContact"),
          contactMethod: method,
        }),
      }),
    ({ report }) => onDone(report.id, report.refNo),
  );
  const active = properties.filter((p) => p.status === "active");

  return (
    <Modal
      size="lg"
      title="Log a phone issue"
      context="Source is recorded as Phone"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="phone-report" disabled={saving}>
            {saving ? "Logging…" : "Log issue"}
          </Button>
        </>
      }
    >
      <form id="phone-report" onSubmit={onSubmit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectField label="Community" name="propertyId" required defaultValue="" error={errors.propertyId} className="sm:col-span-2">
          <option value="" disabled>
            Choose the property
          </option>
          {active.map((p) => (
            <option key={p.id} value={p.id}>
              {propertyOptionLabel(p)}
              {p.city ? ` (${p.city})` : ""}
            </option>
          ))}
        </SelectField>
        <TextField label="Building" name="building" optional error={errors.building} />
        <TextField label="Unit" name="unit" optional error={errors.unit} />
        <SelectField label="What happened" name="issueType" required defaultValue="" error={errors.issueType}>
          <option value="" disabled>
            Choose an issue
          </option>
          {types.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </SelectField>
        <TextField label="When it happened" name="issueDate" type="date" optional max={nyToday()} error={errors.issueDate} />
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor="phone-description" className="text-sm font-semibold">
            Details <span className="font-normal text-muted">(optional)</span>
          </label>
          <textarea id="phone-description" name="description" rows={3} className="rounded-lg border border-field px-3 py-2 text-base focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/25" />
          {errors.description && <p className="m-0 text-[13px] font-semibold text-danger">{errors.description}</p>}
        </div>
        <TextField label="Resident's name" name="reporterName" required autoComplete="off" error={errors.reporterName} />
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">How to reach them</span>
          <SegmentedControl
            label="How to reach them"
            value={method}
            onChange={setMethod}
            options={[
              { value: "phone", label: "Phone" },
              { value: "email", label: "Email" },
            ]}
          />
        </div>
        <TextField
          label={method === "phone" ? "Phone number" : "Email"}
          name="reporterContact"
          type={method === "phone" ? "tel" : "email"}
          required
          autoComplete="off"
          hint={method === "email" ? "They get the usual confirmation email." : "No email is sent."}
          error={errors.reporterContact}
          className="sm:col-span-2"
        />
        {formError && (
          <div className="sm:col-span-2">
            <Alert>{formError}</Alert>
          </div>
        )}
      </form>
    </Modal>
  );
}
