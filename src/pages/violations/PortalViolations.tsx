import { propertyLocation } from "../../lib/propertyAddress";
import { PropertyAddress } from "../../components/PropertyAddress";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { useUser } from "@clerk/clerk-react";
import { roleFrom } from "../../access";
import { errorMessage, useApi, type ViolationDetail } from "../../lib/api";
import { serviceTime } from "../../lib/format";
import { Alert, Loading } from "../../components/ui";
import { StatusBadge } from "../../components/display";
import { MANAGER_PREVIEW_DENIED, useManagerPreview } from "../../lib/preview";
import { usePortalPage } from "../../components/admin/adminPage";
import { Details, Gallery, Notes, People, UnitHistoryCard } from "./ViolationDetailPage";
import { PropertyViolation } from "./PropertyViolation";

/** /portal/violations/:id: the property's view (REP_PORTAL_SPEC 7.6), or today's view for the valet and Steward. */
export function PortalViolationPage() {
  const { violationId: id = "" } = useParams();
  const api = useApi();
  const { user } = useUser();
  const preview = useManagerPreview();
  // Previewing as a manager, the page shows exactly what a manager sees.
  const role = preview.on ? "manager" : roleFrom(user?.publicMetadata);
  const key = ["portal", "violation", id, preview.query];
  const { data: v, error, isPending } = useQuery({ queryKey: key, queryFn: () => api<ViolationDetail>(`/portal/violations/${id}${preview.query}`), enabled: !preview.denied });
  const fieldStaff = role === "lead" || role === "valet";
  usePortalPage(
    v ? `V-${v.refNo} ${v.typeLabel}` : null,
    v ? [...(fieldStaff ? [] : [{ label: "Violations", to: `/portal/violations?property=${v.propertyId}` }]), { label: `V-${v.refNo}` }] : undefined,
  );

  if (preview.denied) return <Alert>{MANAGER_PREVIEW_DENIED}</Alert>;
  if (isPending) return <Loading />;
  if (error) return <Alert>{errorMessage(error)}</Alert>;
  if (fieldStaff) return <FieldStaffViolation v={v} queryKey={key} />;
  return <PropertyViolation v={v} queryKey={key} readOnly={preview.on} previewQuery={preview.query} />;
}

/** The valet who logged it and its Steward: today's page, with CBES-only notes and no status control. */
function FieldStaffViolation({ v, queryKey }: { v: ViolationDetail; queryKey: unknown[] }) {
  const queryClient = useQueryClient();
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <Link to={`/portal/properties/${v.propertyId}`} className="self-start text-[15px] font-semibold">
        <span>{v.propertyName}<PropertyAddress property={propertyLocation(v)} /></span>
      </Link>
      <div className="min-w-0">
        <p className="m-0 text-[13px] font-bold text-muted">
          V-{v.refNo} · {serviceTime(v.loggedAt)}
        </p>
        <h1 className="mt-0.5 mb-1.5 text-3xl font-bold text-navy">
          {v.typeLabel} · Unit {v.unit}
        </h1>
        <StatusBadge kind="violation" status={v.status} />
      </div>
      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[1.4_1_520px] flex-col gap-5">
          <Gallery area="portal" v={v} />
          <Notes area="portal" v={v} staff onAdded={() => queryClient.invalidateQueries({ queryKey })} />
        </div>
        <div className="flex min-w-0 flex-[1_1_340px] flex-col gap-5">
          <Details v={v} area="portal" />
          <People v={v} />
          <UnitHistoryCard v={v} area="portal" />
        </div>
      </div>
    </div>
  );
}
