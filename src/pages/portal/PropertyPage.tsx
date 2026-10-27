import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { errorMessage, useApi, type PropertyOverview } from "../../lib/api";
import { CONTRACT_LABELS, formatDate } from "../../lib/format";
import { Alert, ButtonLink, Card, Loading, Stat } from "../../components/ui";

/** A property manager's home: their property's details and resident reports. */
export function PropertyPage() {
  const { id = "" } = useParams();
  const api = useApi();
  const { data, error, isPending } = useQuery({
    queryKey: ["portal", "property", id],
    queryFn: () => api<PropertyOverview>(`/portal/properties/${id}`),
  });
  useEffect(() => {
    if (data) document.title = `${data.property.name} | CBES Portal`;
  }, [data]);

  if (isPending) return <Loading />;
  if (error) return <Alert>{errorMessage(error)}</Alert>;
  const { property, openReports, recentReports, buildings, units } = data;

  const details: [string, string | number | null][] = [
    ["Address", [property.address, property.city].filter(Boolean).join(", ") || null],
    ["Units", property.unitCount],
    ["Management company", property.managementCompany],
    ["Service started", property.serviceStartDate],
    ["Contract", property.contractType ? CONTRACT_LABELS[property.contractType] : null],
  ];

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="mt-0 mb-1 text-sm font-semibold text-gold-text">Your property</p>
          <h1 className="m-0 text-3xl font-bold text-navy">{property.name}</h1>
        </div>
        <ButtonLink to={`/portal/properties/${property.id}/report`} className="w-full sm:w-auto">
          Weekly report
        </ButtonLink>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat value={openReports} label="Open resident reports" />
        <Stat value={buildings || "—"} label="Buildings" />
        <Stat value={units || property.unitCount || "—"} label="Units" />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card title="Latest resident reports">
          {recentReports.length === 0 ? (
            <p className="m-0 text-muted">No resident reports yet.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col divide-y divide-line p-0">
              {recentReports.map((r) => (
                <li key={r.refNo} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
                  <div className="min-w-0">
                    <p className="m-0 font-semibold">
                      #{r.refNo} · {r.issueLabel}
                    </p>
                    <p className="m-0 text-[14px] text-muted">
                      {formatDate(r.createdAt)}
                      {r.unit ? ` · ${r.unit}` : ""}
                    </p>
                  </div>
                  <span className="rounded-full bg-tint px-2.5 py-0.5 text-[13px] font-semibold text-navy">{r.statusLabel}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Property details">
          <dl className="m-0 flex flex-col gap-3">
            {details.map(([k, v]) => (
              <div key={k}>
                <dt className="text-[13px] text-muted">{k}</dt>
                <dd className="m-0">{v ?? <span className="text-muted">Not set</span>}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-5 mb-0 text-[14px] text-muted">
            Something out of date? Email <a href="mailto:office@cbenvironments.com">office@cbenvironments.com</a>.
          </p>
        </Card>
      </div>
    </div>
  );
}
