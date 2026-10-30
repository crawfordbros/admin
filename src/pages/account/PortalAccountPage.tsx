import { usePortalPage } from "../../components/admin/adminPage";
import { PageHeader } from "../../components/display";
import { AccountSettings } from "./AccountSettings";

/** /portal/settings and /portal/account: Account settings for everyone on the property side. */
export function PortalAccountPage() {
  usePortalPage("Account settings");
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader title="Account settings" description="Your password, two-step verification and signed-in devices. Changes here apply only to you." />
      <AccountSettings />
    </div>
  );
}
