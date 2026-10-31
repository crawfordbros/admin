import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { errorMessage, useApi, type MyNotifications, type NotificationPrefs } from "../../lib/api";
import { useSecurityStatus } from "../../pages/auth/security";
import { Switch } from "../controls";
import { Skeleton } from "../display";
import { Icon } from "../icons";
import { useToast } from "../Toast";
import { Alert, ButtonLink } from "../ui";
import { cx } from "../styles";

// Cards shared by Team and settings (Representatives) and My account (managers): REP_PORTAL_SPEC 7.4, 7.9.

export const settingsCard = "rounded-2xl border border-line bg-white p-5";

type Choice = keyof NotificationPrefs | "weeklyReport";
type Row = { key: Choice; title: string; sub: string };

const ROWS: Record<"representative" | "manager", Row[]> = {
  representative: [
    { key: "violationsSent", title: "Violations sent to my properties", sub: "One email per CBES send" },
    { key: "newIssues", title: "New resident issues", sub: "As they come in" },
    { key: "issueUpdates", title: "Updates on issues I follow", sub: "CBES replies and resolutions" },
    { key: "weeklyRollup", title: "Monday weekly report", sub: "Organization roll-up, 7 AM ET" },
    { key: "inviteAccepted", title: "Invitation accepted", sub: "When someone joins your team" },
  ],
  manager: [
    { key: "violationsSent", title: "Violations sent to my properties", sub: "One email per CBES send" },
    { key: "newIssues", title: "New resident issues", sub: "As they come in" },
    { key: "issueUpdates", title: "Updates on issues I follow", sub: "CBES replies and resolutions" },
    { key: "weeklyReport", title: "Monday weekly report", sub: "For your properties, 7 AM ET" },
  ],
};

const KEY = ["portal", "me", "notifications"];

/** Email switches. Each one saves as soon as it's flipped. */
export function MyNotificationsCard({ variant, className }: { variant: "representative" | "manager"; className?: string }) {
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data, error, isPending } = useQuery({ queryKey: KEY, queryFn: () => api<MyNotifications>("/portal/me/notifications") });
  const save = useMutation({
    mutationFn: (patch: Partial<Record<Choice, boolean>>) => api<MyNotifications>("/portal/me/notifications", { method: "PATCH", body: JSON.stringify(patch) }),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: KEY });
      const before = queryClient.getQueryData<MyNotifications>(KEY);
      if (before) {
        const { weeklyReport, ...prefs } = patch;
        queryClient.setQueryData<MyNotifications>(KEY, {
          prefs: { ...before.prefs, ...prefs },
          weeklyReport: weeklyReport === undefined ? before.weeklyReport : { ...before.weeklyReport, on: weeklyReport },
        });
      }
      return { before };
    },
    onError: (err, _patch, context) => {
      if (context?.before) queryClient.setQueryData(KEY, context.before);
      toast.error(errorMessage(err));
    },
    onSuccess: (next) => queryClient.setQueryData(KEY, next),
  });

  const value = (key: Choice) => (key === "weeklyReport" ? Boolean(data?.weeklyReport.on) : Boolean(data?.prefs[key]));
  const disabledNote = (key: Choice) => {
    if (key !== "weeklyReport" || !data) return null;
    if (data.weeklyReport.locked) return "Always on for your role";
    if (!data.weeklyReport.applies) return "Starts when you're added to a property";
    return null;
  };

  return (
    <section aria-labelledby="my-notifications" className={cx(settingsCard, className)}>
      <h2 id="my-notifications" className="m-0 text-[17px] text-navy-ink">
        My notifications
      </h2>
      <p className="mt-1 mb-3 text-[13px] text-muted">Emails come from office@cbenvironments.com. You'll still see everything in the portal.</p>
      {error ? (
        <Alert>{errorMessage(error)}</Alert>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {ROWS[variant].map((row) => {
            const note = disabledNote(row.key);
            return (
              <li key={row.key} className="flex items-center justify-between gap-4 border-t border-line py-3 first:border-t-0">
                <span className="min-w-0">
                  <span className="block text-[14px] font-bold text-ink">{row.title}</span>
                  <span className="block text-[12.5px] text-muted">{note ?? row.sub}</span>
                </span>
                {isPending ? (
                  <Skeleton className="h-6 w-11 rounded-full" />
                ) : (
                  <Switch label={row.title} checked={value(row.key)} disabled={Boolean(note)} onChange={(on) => save.mutate({ [row.key]: on })} />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** How you sign in, with the way to change it (the existing Account settings security flow). */
export function SignInSecurityCard({ team, className }: { team: boolean; className?: string }) {
  const { data } = useSecurityStatus();
  const method = !data ? null : data.passkey && data.authenticator ? "Passkey and authenticator app" : data.passkey ? "Passkey" : data.authenticator ? "Authenticator app" : "Not set up yet";
  return (
    <section aria-labelledby="sign-in-security" className={cx(settingsCard, "flex flex-col gap-3", className)}>
      <h2 id="sign-in-security" className="m-0 text-[17px] text-navy-ink">
        Sign-in and security
      </h2>
      <p className="m-0 flex items-center gap-2 text-[14px] font-bold text-ink">
        <Icon name={data?.passkey ? "lock" : "shield"} size={18} strokeWidth={2} className="text-navy" />
        {method ?? <Skeleton className="h-4 w-32" />}
      </p>
      <p className="m-0 text-[13px] text-muted">
        {team ? "Everyone on your team must use a passkey or authenticator app." : "The Property Portal asks everyone for a passkey or authenticator app."}
      </p>
      <ButtonLink variant="secondary" to="/portal/settings" className="self-start">
        Manage sign-in methods
      </ButtonLink>
    </section>
  );
}
