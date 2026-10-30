import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ApiError, errorMessage, useApi, type OrganizationRow, type QuoteCard } from "../../lib/api";
import { Alert, Button, SelectField } from "../../components/ui";
import { Modal } from "../../components/overlay";
import { useToast } from "../../components/Toast";
import { propertyPath } from "../admin/paths";

/** Moving a quote to Lost always records why, so the pipeline numbers mean something later. */
export function LostModal({ name, onClose, onConfirm }: { name: string; onClose: () => void; onConfirm: (reason: string) => Promise<void> }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!reason.trim()) return setError("Say why, such as price, timing or chose another provider.");
    setSaving(true);
    try {
      await onConfirm(reason.trim());
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };
  return (
    <Modal
      title="Mark as lost"
      context={name}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" disabled={saving} onClick={submit}>
            Mark lost
          </Button>
        </>
      }
    >
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        Why didn't it go ahead?
        <textarea data-autofocus rows={3} value={reason} onChange={(e) => setReason(e.target.value)} aria-invalid={error ? true : undefined} className="rounded-lg border border-field px-3 py-2 text-base font-normal aria-[invalid=true]:border-danger" />
      </label>
      {error && <p className="mt-1.5 mb-0 text-[13px] font-semibold text-danger">{error}</p>}
    </Modal>
  );
}

/**
 * Won: set up the customer straight away. Creates the organization (or adds to an existing one)
 * and the first property from the quote, then opens the property.
 */
export function ConvertModal({ quote, onClose }: { quote: Pick<QuoteCard, "id" | "community" | "company" | "contactName" | "propertyCount" | "units">; onClose: () => void }) {
  const api = useApi();
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const orgs = useQuery({ queryKey: ["organizations"], queryFn: () => api<{ organizations: OrganizationRow[] }>("/organizations") });
  const [orgId, setOrgId] = useState("");
  const name = quote.community ?? quote.contactName;
  const multipleProperties = (quote.propertyCount ?? 1) > 1;
  const done = () => queryClient.invalidateQueries({ queryKey: ["admin"] });

  const convert = useMutation({
    mutationFn: () => api<{ organizationId: string; propertyId: string | null }>(`/admin/quotes/${quote.id}/convert`, { method: "POST", body: JSON.stringify(orgId ? { organizationId: orgId } : {}) }),
    onSuccess: async ({ organizationId, propertyId }) => {
      toast.success(propertyId ? `${name} won. The property is set up; add its details and invite its team.` : `${name} won. Add each property with its own unit count and invite the representative.`);
      await done();
      navigate(propertyId ? `${propertyPath(organizationId, propertyId)}?tab=settings` : `/admin/organizations/${organizationId}`);
    },
    // An organization with that name already exists: choose it, and the next click adds the property there.
    onError: (err) => {
      if (err instanceof ApiError && err.details.code === "organization_exists" && typeof err.details.organizationId === "string") setOrgId(err.details.organizationId);
    },
  });
  const markWon = useMutation({
    mutationFn: () => api(`/admin/quotes/${quote.id}`, { method: "PATCH", body: JSON.stringify({ stage: "won" }) }),
    onSuccess: async () => {
      toast.success(`${name} marked won.`);
      await done();
      onClose();
    },
  });
  const exists = convert.error instanceof ApiError && convert.error.details.code === "organization_exists";
  const error = exists ? null : (convert.error ?? markWon.error);

  return (
    <Modal
      title="Won: set up the customer"
      context={name}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" disabled={markWon.isPending} onClick={() => markWon.mutate()}>
            Just mark won
          </Button>
          <Button disabled={convert.isPending} onClick={() => convert.mutate()}>
            {convert.isPending ? "Setting up…" : multipleProperties ? (orgId ? "Use organization" : "Create organization") : orgId ? "Add property to organization" : "Create organization and property"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="m-0 text-[15px] leading-relaxed">
          {multipleProperties ? (
            <>This quote covers <strong>{quote.propertyCount} properties</strong>{quote.units ? ` and ${quote.units} total units` : ""}. Set up the organization, then add each property with its own unit count and invite the representative.</>
          ) : (
            <>This creates <strong>{name}</strong>{quote.units ? ` (${quote.units} units)` : ""} as a property, filled in from the quote. You add the Connecteam job, Steward and team after.</>
          )}
        </p>
        <SelectField label="Organization" value={orgId} onChange={(e) => setOrgId(e.target.value)} hint="Choose an existing management company, or leave it to create a new one.">
          <option value="">Create “{quote.company ?? name}” (onboarding)</option>
          {orgs.data?.organizations.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </SelectField>
        {exists && <p className="m-0 rounded-lg bg-warning-bg px-3 py-2 text-[14px] font-semibold text-warning">{quote.company ?? name} is already an organization, so it's chosen above. {multipleProperties ? "Use it to continue setup." : "Add the property to it."}</p>}
        {error && <Alert>{errorMessage(error)}</Alert>}
      </div>
    </Modal>
  );
}
