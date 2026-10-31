import { PropertyAddress } from "../../../components/PropertyAddress";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { errorMessage, useApi, type PortalPropertyCard } from "../../../lib/api";
import { Modal } from "../../../components/overlay";
import { useToast } from "../../../components/Toast";
import { Alert, Button } from "../../../components/ui";
import { InviteRows, ManagerPicker, blankInvite, filledInvites, inviteErrors, useOrgTeam, type NewInviteRow } from "../../../components/portal/team";

/**
 * "Managers for {property}" (REP_PORTAL_SPEC 7.1): tick people already on the team, invite new ones.
 * A property can be left with no manager; the dashboard card then says so.
 */
export function AssignManagerModal({ orgId, property, onClose }: { orgId: string; property: PortalPropertyCard; onClose: () => void }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { people } = useOrgTeam(orgId);
  const current = property.managers.map((m) => m.id);
  const [chosen, setChosen] = useState<string[]>(current);
  const [invites, setInvites] = useState<NewInviteRow[]>([blankInvite(0)]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const adding = chosen.filter((id) => !current.includes(id));
  const removing = current.filter((id) => !chosen.includes(id));
  // Taking someone off their only property ends their portal access, so say so before saving.
  const losingAccess = people.filter((p) => removing.includes(p.id) && p.propertyIds.length === 1 && p.propertyIds[0] === property.id);

  async function save() {
    const found = inviteErrors(invites);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) return;
    setSaving(true);
    const failures: string[] = [];
    const attempt = async (label: string, run: () => Promise<unknown>) => {
      try {
        await run();
      } catch (err) {
        failures.push(`${label}: ${errorMessage(err)}`);
      }
    };
    const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? "Someone";
    const base = `/organizations/${orgId}/properties/${property.id}/members`;
    for (const id of adding) await attempt(nameOf(id), () => api(base, { method: "POST", body: JSON.stringify({ userId: id }) }));
    for (const id of removing) await attempt(nameOf(id), () => api(`${base}/${id}`, { method: "DELETE" }));
    for (const inv of filledInvites(invites)) {
      await attempt(inv.email, () => api(`/organizations/${orgId}/invitations`, { method: "POST", body: JSON.stringify({ ...inv, propertyIds: [property.id] }) }));
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["rep", "dashboard", orgId] }),
      queryClient.invalidateQueries({ queryKey: ["organization", orgId] }),
      queryClient.invalidateQueries({ queryKey: ["portal", "nav-counts"] }),
    ]);
    setSaving(false);
    if (failures.length) {
      setFormError(`Some changes didn't save. ${failures.join(" ")}`);
      return;
    }
    toast.success("Managers updated.");
    onClose();
  }

  return (
    <Modal
      title={`Managers for ${property.name}`}
      context={<PropertyAddress property={property} />}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save managers"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <ManagerPicker orgId={orgId} value={chosen} onChange={setChosen} />
        {losingAccess.length > 0 && (
          <p role="status" className="m-0 rounded-xl bg-warning-bg px-3.5 py-2.5 text-[13px] text-warning">
            {losingAccess.map((p) => p.name).join(" and ")} {losingAccess.length === 1 ? "has" : "have"} no other property, so removing them ends their portal
            access.
          </p>
        )}
        <InviteRows value={invites} onChange={setInvites} roles={["manager"]} errors={errors} />
        {formError && <Alert>{formError}</Alert>}
      </div>
    </Modal>
  );
}
