import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { OrgLogo } from "../../../components/brand";
import { settingsCard } from "../../../components/portal/account";
import { useToast } from "../../../components/Toast";
import { Alert, Button, TextField } from "../../../components/ui";
import { cx } from "../../../components/styles";
import { errorMessage, useApi, type OrganizationProfile } from "../../../lib/api";
import { IMAGE_TYPES, MAX_IMAGE_BYTES, squareWebp } from "../../../lib/images";
import { useFormSubmit } from "../../../lib/useFormSubmit";

/** Logo, name, main office phone and billing email (REP_PORTAL_SPEC 7.4, C6). */
export function OrganizationProfileCard({ org, className }: { org: OrganizationProfile; className?: string }) {
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: ["organization", org.id] }), queryClient.invalidateQueries({ queryKey: ["me"] })]);

  const { onSubmit, errors, formError, saving } = useFormSubmit(
    (v) =>
      api(`/organizations/${org.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: v.get("name"), phone: v.get("phone"), billingEmail: v.get("billingEmail") }),
      }),
    async () => {
      await refresh();
      toast.success("Organization saved.");
    },
  );

  const upload = async (file: File) => {
    if (file.size > MAX_IMAGE_BYTES) return toast.error("That image is over 5 MB. Choose a smaller one.");
    setUploading(true);
    try {
      const image = await squareWebp(file);
      await api(`/organizations/${org.id}/logo`, { method: "POST", body: image, headers: { "Content-Type": image.type } });
      await refresh();
      toast.success("Logo updated.");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  return (
    <section aria-labelledby="org-profile" className={cx(settingsCard, "flex flex-col gap-4", className)}>
      <h2 id="org-profile" className="m-0 text-[17px] text-navy-ink">
        Organization profile
      </h2>
      <div className="flex items-center gap-3.5">
        <OrgLogo org={org} size={56} />
        <div className="flex min-w-0 flex-col gap-1">
          <Button variant="secondary" className="self-start" disabled={uploading} onClick={() => input.current?.click()}>
            {uploading ? "Uploading…" : org.logoVersion ? "Change logo" : "Add a logo"}
          </Button>
          <p className="m-0 text-[12.5px] text-muted">Shown on reports and courtesy notices.</p>
        </div>
        <input
          ref={input}
          type="file"
          accept={IMAGE_TYPES}
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void upload(file);
          }}
        />
      </div>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3.5">
        {formError && <Alert>{formError}</Alert>}
        <TextField label="Organization name" name="name" defaultValue={org.name} required error={errors.name} />
        <TextField label="Main office phone" name="phone" type="tel" autoComplete="tel" defaultValue={org.phone ?? ""} hint="Printed on courtesy notices." optional error={errors.phone} />
        <TextField label="Billing contact email" name="billingEmail" type="email" defaultValue={org.billingEmail ?? ""} optional error={errors.billingEmail} />
        <Button type="submit" disabled={saving} className="self-start">
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </form>
    </section>
  );
}
