import { propertyAddressText } from "../../../lib/propertyAddress";
import { PropertyAddress } from "../../../components/PropertyAddress";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { errorMessage, useApi, type PropertyHome, type WeeklyReport } from "../../../lib/api";
import { formatCount, replyHours } from "../../../lib/format";
import { MANAGER_PREVIEW_DENIED, useManagerPreview } from "../../../lib/preview";
import { usePortalPage } from "../../../components/admin/adminPage";
import { PropertyPhoto } from "../../../components/brand";
import { KpiTile, Pill, Skeleton, TileSkeletons } from "../../../components/display";
import { Icon } from "../../../components/icons";
import { useOptionalRepContext } from "../../../components/portal/RepContext";
import { useToast } from "../../../components/Toast";
import { Alert, Button, ButtonLink } from "../../../components/ui";
import { AssignManagerModal } from "../dashboard/AssignManagerModal";
import { ReportLinkCard, TeamCard, TonightCard } from "./aside";
import { EditPropertyModal } from "./EditPropertyModal";
import { RepeatUnits, ResidentIssues, ViolationsToReview } from "./sections";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "Avg 1.4 days to resolve"; under a day reads as such rather than "0 days". */
function resolvedText(days: number | null) {
  if (days === null) return "None resolved yet";
  return days < 1 ? "Avg under a day to resolve" : `Avg ${days} days to resolve`;
}

function Loading() {
  return (
    <div className="flex flex-col gap-5">
      <Skeleton className="h-[200px] w-full rounded-2xl" />
      <TileSkeletons />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

/**
 * /portal/properties/:propertyId (REP_PORTAL_SPEC 7.2): a manager's home for their property, and what
 * a Representative sees when they open one. Representatives also edit the basics and manage the
 * team; the admin's ?as=manager preview shows no write controls at all.
 */
export function PropertyHomePage() {
  const { propertyId = "" } = useParams();
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const preview = useManagerPreview();
  const shell = useOptionalRepContext();
  const [editing, setEditing] = useState(false);
  const [managing, setManaging] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const key = ["portal", "property", propertyId, preview.query];
  const { data: home, error, isPending, refetch, isFetching } = useQuery({
    queryKey: key,
    queryFn: () => api<PropertyHome>(`/portal/properties/${propertyId}${preview.query}`),
    enabled: !preview.denied,
  });
  const name = home?.property.name ?? null;
  // Representatives see "{Organization} / {Property}"; a manager's breadcrumb already starts with it.
  usePortalPage(name, name && shell?.kind === "organization" ? [{ label: name, description: home ? propertyAddressText(home.property) : undefined }] : undefined);

  if (preview.denied) return <Alert>{MANAGER_PREVIEW_DENIED}</Alert>;
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

  const p = home.property;
  const readOnly = preview.on;
  const canManage = home.canManage && !readOnly;
  const k = home.kpis;
  const changed = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["portal", "property", propertyId] }),
      queryClient.invalidateQueries({ queryKey: ["portal", "violations"] }),
      queryClient.invalidateQueries({ queryKey: ["portal", "nav-counts"] }),
      queryClient.invalidateQueries({ queryKey: ["rep"] }),
    ]);

  const lastWeekPdf = async () => {
    setDownloading(true);
    try {
      const [report, { downloadReportPdf }] = await Promise.all([api<WeeklyReport>(`/portal/properties/${p.id}/report`), import("../../../lib/report-pdf")]);
      downloadReportPdf(report);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setDownloading(false);
    }
  };

  const h = home.header;
  const facts = [h.units ? `${formatCount(h.units)} units` : null, h.buildings ? plural(h.buildings, "building") : null].filter(Boolean).join(" · ");

  return (
    <div className="flex flex-col gap-5">
      <section aria-label="Property" className="flex flex-wrap overflow-hidden rounded-2xl border border-line bg-white">
        <div className="relative min-h-[200px] flex-[1_1_280px] bg-tint-2">
          {p.organizationId ? <PropertyPhoto orgId={p.organizationId} property={p} className="absolute inset-0" /> : null}
        </div>
        <div className="flex flex-[3_1_480px] flex-col gap-3.5 px-6 py-[22px]">
          <div className="flex flex-wrap items-start justify-between gap-3.5">
            <div className="min-w-0">
              {home.organization && <p className="m-0 text-[12.5px] font-bold tracking-[0.08em] text-gold-text uppercase">{home.organization.name}</p>}
              <h1 className="mt-1 mb-0 text-[30px] text-navy-ink">{p.name}</h1>
              <PropertyAddress property={p} className="text-[14px]" />
              {facts && <p className="mt-1 mb-0 text-[14px] text-muted">{facts}</p>}
            </div>
            <div className="flex flex-wrap gap-2.5">
              <ButtonLink to={`/portal/reporting?scope=property&property=${p.id}`}>
                <Icon name="bar-chart" size={20} strokeWidth={2} />
                Reporting
              </ButtonLink>
              <Button variant="secondary" onClick={lastWeekPdf} disabled={downloading}>
                <Icon name="download" size={18} strokeWidth={2} />
                {downloading ? "Preparing…" : "Last week's PDF"}
              </Button>
              {canManage && (
                <Button variant="secondary" onClick={() => setEditing(true)}>
                  <Icon name="edit" size={18} strokeWidth={2} />
                  Edit
                </Button>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {h.startingOn ? <Pill tone="warning">Starting {h.startingOn}</Pill> : <Pill tone="success">Service active · {h.serviceNightsLabel}</Pill>}
            <Pill tone="neutral">Trash out {h.trashOutWindow}</Pill>
            {h.pressureWashing && h.pressureWashingNext && <Pill tone="gold">Spot pressure washing · next in {h.pressureWashingNext}</Pill>}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3.5">
        <KpiTile label="Violations to review" icon="alert-triangle" iconTone="warning" value={k.violationsToReview} delta={{ text: "Sent by CBES", tone: "neutral" }} to={`/portal/violations?property=${p.id}`} />
        <KpiTile
          label="Resolved, 30 days"
          icon="check"
          iconTone="success"
          value={k.resolved30d.value}
          delta={{ text: resolvedText(k.resolved30d.avgDaysToResolve), tone: "neutral" }}
          to={`/portal/violations?property=${p.id}&status=resolved`}
        />
        <KpiTile
          label="Open resident issues"
          icon="message"
          value={k.openIssues.value}
          delta={{ text: k.openIssues.lastReplyHours === null ? "CBES replies within 24 hours" : `CBES replied in ${replyHours(k.openIssues.lastReplyHours)}`, tone: "neutral" }}
          to={`/portal/issues?property=${p.id}`}
        />
        <KpiTile
          label="Service nights"
          icon="calendar"
          iconTone="success"
          value={k.serviceNights.scheduled ? `${k.serviceNights.serviced} of ${k.serviceNights.scheduled}` : "—"}
          delta={{ text: k.serviceNights.scheduled ? "This week so far" : "None yet this week", tone: "neutral" }}
        />
        <KpiTile
          label="Repeat units"
          icon="eye"
          value={k.repeatUnits}
          delta={{ text: `${home.stats?.overwatchThreshold.count ?? 3}+ violations in ${home.stats?.overwatchThreshold.days ?? 30} days`, tone: "neutral" }}
        />
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <ViolationsToReview home={home} readOnly={readOnly} onChanged={changed} preview={preview.query} />
          <ResidentIssues home={home} />
          <RepeatUnits home={home} />
        </div>
        <aside className="flex min-w-0 flex-col gap-4">
          <TonightCard home={home} />
          <TeamCard home={home} canManage={canManage} onManage={() => setManaging(true)} />
          <ReportLinkCard home={home} />
        </aside>
      </div>

      {editing && <EditPropertyModal home={home} onClose={() => setEditing(false)} />}
      {managing && p.organizationId && (
        <AssignManagerModal
          orgId={p.organizationId}
          property={{
            id: p.id,
            name: p.name,
            address: p.address,
            city: p.city,
            zip: p.zip,
            units: p.unitCount,
            photoVersion: p.photoVersion,
            status: "active",
            serviceStartDate: p.serviceStartDate,
            violationsToReview: k.violationsToReview,
            openIssues: k.openIssues.value,
            managers: home.team.members.map(({ id, name: n, role }) => ({ id, name: n, role })),
          }}
          onClose={() => {
            setManaging(false);
            void changed();
          }}
        />
      )}
    </div>
  );
}
