import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { useUser } from "@clerk/clerk-react";
import { roleFrom } from "../../access";
import { errorMessage, useApi, type ViolationDetail, type ViolationList } from "../../lib/api";
import { serviceTime } from "../../lib/format";
import { Alert, Button, Card, Loading } from "../../components/ui";
import { StatusBadge } from "../../components/display";
import { useToast } from "../../components/Toast";
import { MANAGER_PREVIEW_DENIED, useManagerPreview } from "../../lib/preview";
import { unwrap } from "./paths";
import { Details, Gallery, Notes, People, UnitHistoryCard } from "./ViolationDetailPage";
import { ViolationThumb } from "./shared";

/**
 * The violations CBES has sent to this property, on the manager's property page. The API only
 * returns violations that were sent (or resolved after that), never ones still in review.
 */
export function PropertyViolations({ propertyId, preview }: { propertyId: string; preview?: boolean }) {
  const api = useApi();
  const flag = preview ? "?as=manager" : "";
  const { data, error } = useQuery({
    queryKey: ["portal", "violations", propertyId, Boolean(preview)],
    queryFn: () => api<ViolationList>(`/portal/properties/${propertyId}/violations${flag}`),
  });
  return (
    <Card title="Violations from CBES">
      {error && <Alert>{errorMessage(error)}</Alert>}
      {data && data.items.length === 0 && <p className="m-0 text-muted">No violations sent to this property.</p>}
      {data && data.items.length > 0 && (
        <ul className="m-0 flex list-none flex-col divide-y divide-line p-0">
          {data.items.map((v) => (
            <li key={v.id}>
              <Link to={`/portal/violations/${v.id}${flag}`} className="flex items-center gap-3 py-3 text-ink no-underline hover:text-ink">
                <ViolationThumb area="portal" row={v} />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{v.typeLabel}</span>
                  <span className="block text-[14px] text-muted">
                    Unit {v.unit} · {serviceTime(v.loggedAt)}
                  </span>
                </span>
                <StatusBadge kind="violation" status={v.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** /portal/violations/:id — what the property, the valet and the Steward see (ADMIN_PORTAL_SPEC 2.2). */
export function PortalViolationPage() {
  const { id = "" } = useParams();
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { user } = useUser();
  const preview = useManagerPreview();
  // Previewing as a manager, the page shows exactly what a manager sees.
  const role = preview.on ? "manager" : roleFrom(user?.publicMetadata);
  const key = ["portal", "violation", id, preview.query];
  const { data: v, error, isPending } = useQuery({ queryKey: key, queryFn: () => api<ViolationDetail>(`/portal/violations/${id}${preview.query}`), enabled: !preview.denied });
  useEffect(() => {
    if (v) document.title = `V-${v.refNo} ${v.typeLabel} | CBES Portal`;
  }, [v]);

  const resolve = useMutation({
    mutationFn: () => api<{ violation: ViolationDetail }>(`/portal/violations/${id}`, { method: "PATCH", body: JSON.stringify({ status: "resolved" }) }).then(unwrap),
    onSuccess: (updated) => {
      queryClient.setQueryData(key, updated);
      toast.success("Marked resolved.");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (preview.denied) return <Alert>{MANAGER_PREVIEW_DENIED}</Alert>;
  if (isPending) return <Loading />;
  if (error) return <Alert>{errorMessage(error)}</Alert>;

  // Valets and Stewards reply here with CBES-only notes; resolving is for the property's team.
  const propertySide = role === "manager" || role === "director" || role === "representative";
  const canResolve = !preview.on && (role === "manager" || role === "director") && v.status === "sent";

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <Link to={`/portal/properties/${v.propertyId}${preview.query}`} className="self-start text-[15px] font-semibold">
        {v.propertyName}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="m-0 text-[13px] font-bold text-muted">
            V-{v.refNo} · {serviceTime(v.loggedAt)}
          </p>
          <h1 className="mt-0.5 mb-1.5 text-3xl font-bold text-navy">
            {v.typeLabel} · Unit {v.unit}
          </h1>
          <StatusBadge kind="violation" status={v.status} />
        </div>
        {canResolve && (
          <Button disabled={resolve.isPending} onClick={() => resolve.mutate()}>
            {resolve.isPending ? "Saving…" : "Mark resolved"}
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[1.4_1_520px] flex-col gap-5">
          <Gallery area="portal" v={v} />
          <Notes area="portal" v={v} staff={!propertySide} readOnly={preview.on} onAdded={() => queryClient.invalidateQueries({ queryKey: key })} />
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
