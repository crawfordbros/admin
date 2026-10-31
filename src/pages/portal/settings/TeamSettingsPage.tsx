import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { usePortalPage } from "../../../components/admin/adminPage";
import { Tabs } from "../../../components/controls";
import { Skeleton } from "../../../components/display";
import { MyNotificationsCard, SignInSecurityCard } from "../../../components/portal/account";
import { Alert } from "../../../components/ui";
import { errorMessage, useApi, type OrganizationDetail, type TeamResponse } from "../../../lib/api";
import { useQueryState } from "../../../lib/useQueryState";
import { InviteCard } from "./InviteCard";
import { OrganizationProfileCard } from "./OrganizationProfileCard";
import { PendingInvitations, YourTeam } from "./TeamTables";

const TABS = ["team", "invitations", "organization", "notifications"] as const;
type Tab = (typeof TABS)[number];
const isTab = (v: string | null): v is Tab => TABS.includes(v as Tab);

/**
 * /portal/organizations/:orgId/settings (REP_PORTAL_SPEC 7.4): Representatives invite managers,
 * choose which properties they see, and keep the organization's details and their own email choices.
 */
export function TeamSettingsPage() {
  const { orgId = "" } = useParams();
  const api = useApi();
  const queryClient = useQueryClient();
  const { params, update } = useQueryState();
  const tab: Tab = isTab(params.get("tab")) ? (params.get("tab") as Tab) : "team";
  usePortalPage("Team and settings");

  const detail = useQuery({ queryKey: ["organization", orgId], queryFn: () => api<OrganizationDetail>(`/organizations/${orgId}`) });
  const team = useQuery({ queryKey: ["organization", orgId, "team"], queryFn: () => api<TeamResponse>(`/organizations/${orgId}/team`) });
  const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: ["organization", orgId] }), queryClient.invalidateQueries({ queryKey: ["portal", "nav-counts"] })]);

  const org = detail.data?.organization;
  const properties = detail.data?.properties ?? [];
  const error = detail.error ?? team.error;

  const profile = org && <OrganizationProfileCard key={`${org.name}|${org.phone}|${org.billingEmail}`} org={org} />;
  const people = team.data?.team ?? [];
  const invitations = team.data?.invitations ?? [];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="m-0 text-[30px] text-navy-ink">Team and settings</h1>
        <p className="mt-1.5 mb-0 max-w-[72ch] text-[14.5px] text-muted">
          Invite property managers, choose which properties they can see, and keep {org?.name ?? "your organization"}'s details current.
        </p>
      </div>
      <div className="border-b border-line">
        <Tabs
          label="Settings sections"
          variant="underline"
          idPrefix="settings"
          value={tab}
          onChange={(t) => update({ tab: t === "team" ? null : t })}
          tabs={[
            { value: "team", label: "Team", count: team.data ? people.length : undefined },
            { value: "invitations", label: "Invitations", count: team.data ? invitations.length : undefined },
            { value: "organization", label: "Organization" },
            { value: "notifications", label: "Notifications" },
          ]}
        />
      </div>

      <div id="settings-panel" role="tabpanel" aria-labelledby={`settings-tab-${tab}`}>
        {error ? (
          <Alert>{errorMessage(error)}</Alert>
        ) : !detail.data || !team.data ? (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-64 rounded-2xl" />
            <Skeleton className="h-48 rounded-2xl" />
          </div>
        ) : tab === "team" ? (
          <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="flex min-w-0 flex-col gap-5">
              <InviteCard orgId={orgId} properties={properties} onInvited={refresh} />
              <PendingInvitations orgId={orgId} invitations={invitations} onChanged={refresh} />
              <YourTeam orgId={orgId} orgName={org!.name} team={people} properties={properties} onChanged={refresh} />
            </div>
            {/* The design's right column; below 1280 px these live only in their own tabs. */}
            <div className="hidden flex-col gap-5 xl:flex">
              {profile}
              <MyNotificationsCard variant="representative" />
              <SignInSecurityCard team />
            </div>
          </div>
        ) : tab === "invitations" ? (
          <PendingInvitations orgId={orgId} invitations={invitations} onChanged={refresh} standalone />
        ) : tab === "organization" ? (
          <div className="max-w-xl">{profile}</div>
        ) : (
          <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
            <MyNotificationsCard variant="representative" />
            <SignInSecurityCard team />
          </div>
        )}
      </div>
    </div>
  );
}
