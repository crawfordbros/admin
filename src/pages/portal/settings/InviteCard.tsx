import { useState } from "react";
import { Switch } from "../../../components/controls";
import { Icon } from "../../../components/icons";
import { PropertyChips } from "../../../components/portal/PropertyChips";
import { settingsCard } from "../../../components/portal/account";
import { useToast } from "../../../components/Toast";
import { Alert, Button, TextField } from "../../../components/ui";
import { useApi } from "../../../lib/api";
import { useFormSubmit } from "../../../lib/useFormSubmit";

/**
 * Invite a manager (REP_PORTAL_SPEC 7.4). Management Directors are retired (migration 0018), so the
 * one role on offer is shown rather than asked.
 */
export function InviteCard({ orgId, properties, onInvited }: { orgId: string; properties: { id: string; name: string }[]; onInvited: () => Promise<unknown> }) {
  const api = useApi();
  const toast = useToast();
  const only = properties.length === 1 ? [properties[0].id] : [];
  const [propertyIds, setPropertyIds] = useState<string[]>(only);
  const [weekly, setWeekly] = useState(true);

  const { onSubmit, errors, setErrors, formError, saving } = useFormSubmit(
    async (v) => {
      const email = String(v.get("email") ?? "").trim();
      const res = await api<{ status: "invited" | "added" }>(`/organizations/${orgId}/invitations`, {
        method: "POST",
        body: JSON.stringify({ email, name: v.get("name"), role: "manager", propertyIds, receivesWeeklyReport: weekly }),
      });
      return { ...res, email };
    },
    async (res, _v, form) => {
      toast.success(res.status === "added" ? `${res.email} already had an account. They can see these properties now.` : `Invitation sent to ${res.email}.`);
      form.reset();
      setPropertyIds(only);
      setWeekly(true);
      await onInvited();
    },
  );

  return (
    <section aria-labelledby="invite-title" className={settingsCard}>
      <div className="mb-4 flex items-start gap-3">
        <span className="flex size-10 flex-none items-center justify-center rounded-xl bg-tint-2 text-navy">
          <Icon name="user-plus" size={20} strokeWidth={2} />
        </span>
        <div className="min-w-0">
          <h2 id="invite-title" className="m-0 text-[17px] text-navy-ink">
            Invite a manager
          </h2>
          <p className="mt-0.5 mb-0 text-[13px] text-muted">They get an email from office@cbenvironments.com and set up a passkey or authenticator app.</p>
        </div>
      </div>
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          if (!propertyIds.length) {
            e.preventDefault();
            setErrors({ propertyIds: "Choose at least one property" });
            return;
          }
          void onSubmit(e);
        }}
      >
        {formError && <Alert>{formError}</Alert>}
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <TextField label="Work email" name="email" type="email" autoComplete="off" required error={errors.email} />
          <TextField label="Name" name="name" autoComplete="off" optional error={errors.name} />
        </div>
        <div className="rounded-xl border-2 border-navy bg-tint-2 px-3.5 py-3">
          <p className="m-0 text-[14px] font-bold text-ink">Property manager</p>
          <p className="mt-0.5 mb-0 text-[12.5px] text-muted">Mostly view-only. Updates violation status and adds comments. Sees resident issues.</p>
        </div>
        <PropertyChips properties={properties} value={propertyIds} onChange={(ids) => {
            setPropertyIds(ids);
            if (errors.propertyIds) setErrors({ ...errors, propertyIds: "" });
          }} error={errors.propertyIds || undefined} />
        <div className="flex items-center justify-between gap-4 rounded-xl border border-line px-3.5 py-3">
          <span>
            <span className="block text-[14px] font-bold text-ink">Send them the Monday weekly report</span>
            <span className="block text-[12.5px] text-muted">7 AM ET, for the properties above</span>
          </span>
          <Switch label="Send them the Monday weekly report" checked={weekly} onChange={setWeekly} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <p className="m-0 text-[12.5px] text-muted">Invitations expire after 7 days. You can resend any time.</p>
          <Button type="submit" disabled={saving}>
            <Icon name="send" size={16} strokeWidth={2} />
            {saving ? "Sending…" : "Send invitation"}
          </Button>
        </div>
      </form>
    </section>
  );
}
