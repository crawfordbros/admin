import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, Outlet, useParams } from "react-router-dom";
import { errorMessage, useApi, type RepDashboard } from "../../../lib/api";
import { formatCount, greeting, replyHours } from "../../../lib/format";
import { useQueryState } from "../../../lib/useQueryState";
import { usePortalPage } from "../../../components/admin/adminPage";
import { SegmentedControl } from "../../../components/controls";
import { EmptyState, KpiTile, Skeleton, TileSkeletons } from "../../../components/display";
import { Icon } from "../../../components/icons";
import { AttentionList, type AttentionFilter } from "../../../components/portal/AttentionList";
import { PropertyCard } from "../../../components/portal/PropertyCard";
import { useMe } from "../../../components/portal/RepContext";
import { Alert, Button, ButtonLink } from "../../../components/ui";
import { AssignManagerModal } from "./AssignManagerModal";
import { CbesContacts, InvitationsWaiting, ViolationsThisWeek, WeeklyReportCard } from "./DashboardAside";
import type { DashboardOutletContext } from "./RepAddPropertyModal";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const FILTERS: AttentionFilter[] = ["all", "violations", "issues"];

/** The page's opening line: what's waiting, or that nothing is. */
function waiting(d: RepDashboard) {
  const v = d.kpis.violationsToReview;
  const i = d.kpis.openIssues.value;
  if (!v && !i) return "Nothing needs you right now.";
  return `${plural(v, "violation")} and ${plural(i, "resident issue")} ${v + i === 1 ? "is" : "are"} waiting across your properties.`;
}

function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-16 w-full max-w-xl" />
      <TileSkeletons />
      <Skeleton className="h-72 w-full" />
    </div>
  );
}

/**
 * The Representative dashboard, /portal/organizations/:orgId (REP_PORTAL_SPEC 7.1): what needs
 * attention across every property, the properties themselves, and adding more.
 */
export function RepDashboardPage() {
  const { orgId = "" } = useParams();
  const api = useApi();
  const queryClient = useQueryClient();
  const { params, update } = useQueryState();
  const me = useMe();
  const [assigning, setAssigning] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const key = ["rep", "dashboard", orgId];
  const { data, error, isPending, refetch, isFetching } = useQuery({ queryKey: key, queryFn: () => api<RepDashboard>(`/portal/organizations/${orgId}/dashboard`) });
  usePortalPage("Dashboard");

  // People and invitations moved to Team and settings (REP_PORTAL_SPEC C8).
  const tab = params.get("tab");
  if (tab === "people" || tab === "invitations") return <Navigate to={`/portal/organizations/${orgId}/settings?tab=${tab}`} replace />;

  if (isPending) return <Loading />;
  if (error) {
    return (
      <Alert>
        {errorMessage(error)}{" "}
        <Button variant="secondary" onClick={() => refetch()} disabled={isFetching} className="ml-2 min-h-9 px-3 py-1 text-[14px]">
          Retry
        </Button>
      </Alert>
    );
  }

  const d = data;
  const { organization: org, kpis } = d;
  const filter = FILTERS.includes(params.get("filter") as AttentionFilter) ? (params.get("filter") as AttentionFilter) : "all";
  const atLimit = org.propertyCount >= org.propertyLimit;
  const none = org.propertyCount === 0;
  const firstName = me.data?.user.name?.split(" ")[0];
  const reports = `/portal/reporting?scope=organization&org=${org.id}`;
  const q = search.trim().toLowerCase();
  const shown = q ? d.properties.filter((p) => `${p.name} ${p.city ?? ""}`.toLowerCase().includes(q)) : d.properties;
  const assignTo = d.properties.find((p) => p.id === assigning);

  return (
    <div className="flex flex-col gap-[22px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="m-0 text-[13px] font-bold tracking-[0.08em] text-gold-text uppercase">
            {org.name} · {d.week.label}
          </p>
          <h1 className="mt-1.5 mb-0 text-[30px] text-navy-ink">
            {greeting()}
            {firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="mt-1.5 mb-0 text-[14.5px] text-muted">{waiting(d)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <ButtonLink to={reports} variant="secondary">
            <Icon name="bar-chart" size={20} strokeWidth={2} />
            Reporting
          </ButtonLink>
          {atLimit ? (
            <span className="text-[14px] font-semibold text-muted">
              {org.propertyLimit} of {org.propertyLimit} properties
            </span>
          ) : (
            <ButtonLink to="properties/new">
              <Icon name="plus" size={20} strokeWidth={2.2} />
              Add property
            </ButtonLink>
          )}
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3.5">
        <KpiTile label="Properties" icon="building" value={`${kpis.properties.value} of ${kpis.properties.limit}`} delta={{ text: `${formatCount(kpis.properties.units)} units under service`, tone: "neutral" }} />
        <KpiTile
          label="Violations to review"
          icon="alert-triangle"
          iconTone="warning"
          value={none ? "—" : kpis.violationsToReview}
          delta={{ text: "Sent by CBES, not resolved", tone: "neutral" }}
          to={`/portal/violations?org=${org.id}`}
        />
        <KpiTile
          label="Open resident issues"
          icon="message"
          value={none ? "—" : kpis.openIssues.value}
          delta={{ text: kpis.openIssues.oldestHours === null ? "None open" : `Oldest ${plural(kpis.openIssues.oldestHours, "hour")}`, tone: "neutral" }}
          to={`/portal/issues?org=${org.id}`}
        />
        <KpiTile
          label="Service nights"
          icon="calendar"
          iconTone="success"
          value={kpis.serviceNights.scheduled ? `${kpis.serviceNights.serviced} of ${kpis.serviceNights.scheduled}` : "—"}
          delta={{ text: kpis.serviceNights.label, tone: "neutral" }}
          to={reports}
        />
        <KpiTile label="CBES first reply" icon="clock" value={replyHours(kpis.avgFirstReplyHours30d)} delta={{ text: "Average, last 30 days", tone: "neutral" }} to={reports} />
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <section aria-labelledby="attention-title" className="overflow-hidden rounded-2xl border border-line bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-row-line px-5 py-4">
              <div>
                <h2 id="attention-title" className="m-0 text-[19px]">
                  Needs your attention
                </h2>
                <p className="m-0 mt-0.5 text-[13px] text-muted">Violations for your team to handle, plus resident issues CBES is working on.</p>
              </div>
              <SegmentedControl
                label="Show"
                value={filter}
                onChange={(f) => update({ filter: f === "all" ? null : f })}
                options={[
                  { value: "all", label: `All ${kpis.violationsToReview + kpis.openIssues.value}` },
                  { value: "violations", label: `Violations ${kpis.violationsToReview}` },
                  { value: "issues", label: `Issues ${kpis.openIssues.value}` },
                ]}
              />
            </div>
            <AttentionList items={d.attention} filter={filter} />
            <div className="flex flex-wrap gap-[18px] border-t border-row-line px-5 py-3 text-[13.5px] font-bold">
              <Link to={`/portal/violations?org=${org.id}`} className="no-underline hover:underline">
                All violations →
              </Link>
              <Link to={`/portal/issues?org=${org.id}`} className="no-underline hover:underline">
                All resident issues →
              </Link>
            </div>
          </section>

          <section aria-labelledby="properties-title" className="flex flex-col gap-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div>
                <h2 id="properties-title" className="m-0 text-[19px]">
                  Your properties
                </h2>
                <p className="m-0 mt-0.5 text-[13px] text-muted">
                  {org.propertyCount} of {org.propertyLimit} · Open a property to see its violations, issues, reports and CBES team.
                </p>
              </div>
              {!none && (
                <label className="flex h-[38px] items-center gap-2 rounded-[10px] border border-field bg-white px-2.5 text-[13px] text-muted focus-within:border-navy focus-within:ring-2 focus-within:ring-navy/25">
                  <Icon name="search" size={15} strokeWidth={2} />
                  <span className="sr-only">Search properties</span>
                  <input type="search" placeholder="Search properties" value={search} onChange={(e) => setSearch(e.target.value)} className="w-[150px] border-0 bg-transparent text-[13px] text-ink outline-none" />
                </label>
              )}
            </div>
            {none ? (
              <div className="rounded-2xl border border-line bg-white">
                <EmptyState
                  icon="building"
                  title="Add your first property"
                  body="It's live as soon as you add it. CBES is notified so we can assign your Steward and print the resident QR codes."
                  action={<ButtonLink to="properties/new">Add property</ButtonLink>}
                />
              </div>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-4">
                {shown.map((p) => (
                  <PropertyCard key={p.id} orgId={org.id} property={p} canAssign onAssign={() => setAssigning(p.id)} />
                ))}
                {q && shown.length === 0 && <p className="m-0 text-[14px] text-muted">No property matches “{search.trim()}”.</p>}
                {!atLimit && !q && (
                  <Link
                    to="properties/new"
                    className="flex min-h-[260px] flex-col items-center justify-center gap-2.5 rounded-[14px] border-2 border-dashed border-placeholder bg-subtle text-navy no-underline hover:border-navy hover:text-navy"
                  >
                    <span aria-hidden="true" className="flex size-12 items-center justify-center rounded-full bg-tint-2">
                      <Icon name="plus" size={22} strokeWidth={2.2} />
                    </span>
                    <span className="text-[15px] font-bold">Add a property</span>
                    <span className="text-[12.5px] text-muted">
                      {org.propertyLimit - org.propertyCount} of {org.propertyLimit} slots left
                    </span>
                  </Link>
                )}
              </div>
            )}
          </section>
        </div>

        <aside className="flex min-w-0 flex-col gap-4">
          <WeeklyReportCard dashboard={d} />
          <ViolationsThisWeek dashboard={d} />
          <InvitationsWaiting dashboard={d} onResent={() => queryClient.invalidateQueries({ queryKey: key })} />
          <CbesContacts dashboard={d} />
        </aside>
      </div>

      {assignTo && <AssignManagerModal orgId={org.id} property={assignTo} onClose={() => setAssigning(null)} />}
      <Outlet context={{ dashboard: d } satisfies DashboardOutletContext} />
    </div>
  );
}
