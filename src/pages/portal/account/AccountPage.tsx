import { Link, Navigate } from "react-router-dom";
import { usePortalPage } from "../../../components/admin/adminPage";
import { Skeleton } from "../../../components/display";
import { Icon } from "../../../components/icons";
import { MyNotificationsCard, SignInSecurityCard, settingsCard } from "../../../components/portal/account";
import { useMe } from "../../../components/portal/RepContext";
import { Alert } from "../../../components/ui";
import { errorMessage } from "../../../lib/api";

/**
 * /portal/account (REP_PORTAL_SPEC 7.9): a manager's email choices, sign-in, and the properties they
 * can see. Representatives keep theirs in Team and settings.
 */
export function AccountPage() {
  const { data: me, error } = useMe();
  usePortalPage("My account");
  if (me?.user.role === "representative" && me.organizations[0]) {
    return <Navigate to={`/portal/organizations/${me.organizations[0].id}/settings?tab=notifications`} replace />;
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="m-0 text-[30px] text-navy-ink">My account</h1>
        <p className="mt-1.5 mb-0 text-[14.5px] text-muted">Choose which emails you get, and how you sign in.</p>
      </div>
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <MyNotificationsCard variant="manager" />
        <div className="flex flex-col gap-5">
          <section aria-labelledby="your-properties" className={settingsCard}>
            <h2 id="your-properties" className="m-0 text-[17px] text-navy-ink">
              Your properties
            </h2>
            <p className="mt-1 mb-3 text-[13px] text-muted">Your Representative chooses these. Ask them to add or remove one.</p>
            {error ? (
              <Alert>{errorMessage(error)}</Alert>
            ) : !me ? (
              <Skeleton className="h-16" />
            ) : me.properties.length ? (
              <ul className="m-0 flex list-none flex-col p-0">
                {me.properties.map((p) => (
                  <li key={p.id} className="border-t border-line first:border-t-0">
                    <Link to={`/portal/properties/${p.id}`} className="flex items-center gap-3 py-2.5 text-ink no-underline hover:text-navy">
                      <span className="flex size-9 flex-none items-center justify-center rounded-lg bg-tint-2 text-navy">
                        <Icon name="home" size={18} strokeWidth={2} />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[14px] font-bold">{p.name}</span>
                        <span className="block truncate text-[12.5px] text-muted">{[p.city, p.organizationName].filter(Boolean).join(" · ")}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="m-0 text-[14px] text-muted">No properties yet. Your Representative will add you to one.</p>
            )}
          </section>
          <SignInSecurityCard team={false} />
        </div>
      </div>
    </div>
  );
}
