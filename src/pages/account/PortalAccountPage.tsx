import { useEffect } from "react";
import { PageHeader } from "../../components/display";
import { AccountSettings } from "./AccountSettings";

/** /portal/settings: Account settings for representatives, Directors and property managers. */
export function PortalAccountPage() {
  useEffect(() => {
    document.title = "Account settings | CBES Portal";
  }, []);
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader title="Account settings" description="Your password, two-step verification and signed-in devices. Changes here apply only to you." />
      <AccountSettings />
    </div>
  );
}
