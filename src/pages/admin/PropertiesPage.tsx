import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { errorMessage, useApi, type AdminPropertyRow } from "../../lib/api";
import { Alert, ButtonLink, Loading } from "../../components/ui";

export function PropertiesPage() {
  const api = useApi();
  const { data, error, isPending } = useQuery({
    queryKey: ["admin", "properties"],
    queryFn: () => api<{ properties: AdminPropertyRow[] }>("/admin/properties"),
  });
  useEffect(() => {
    document.title = "Properties | CBES Admin";
  }, []);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="m-0 text-3xl font-bold text-navy">Properties</h1>
        <ButtonLink to="/admin/properties/new" className="w-full sm:w-auto">
          Add a property
        </ButtonLink>
      </div>

      {isPending && <Loading />}
      {error && <Alert>{errorMessage(error)}</Alert>}
      {data && data.properties.length === 0 && (
        <p className="rounded-xl border border-line bg-white p-6 text-muted">No properties yet. Add the first one to invite its manager.</p>
      )}
      {data && data.properties.length > 0 && (
        <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-2">
          {data.properties.map((p) => (
            <li key={p.id} className="rounded-xl border border-line bg-white p-5">
              <div className="flex items-start justify-between gap-3">
                <h2 className="m-0 text-lg">
                  <Link to={`/admin/properties/${p.id}`}>{p.name}</Link>
                </h2>
                {p.status !== "active" && <span className="rounded-full bg-surface px-2.5 py-0.5 text-[13px] font-semibold text-muted">Inactive</span>}
              </div>
              <p className="mt-1 mb-1 text-[15px] text-muted">
                {[p.city, p.unitCount ? `${p.unitCount} units` : null].filter(Boolean).join(" · ") || "No details yet"}
              </p>
              <p className="mt-0 mb-3 text-[15px]">
                {p.organizationId ? (
                  <Link to={`/admin/organizations/${p.organizationId}`}>{p.organizationName}</Link>
                ) : (
                  <span className="font-semibold text-gold-text">No organization yet</span>
                )}
              </p>
              <dl className="m-0 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-surface p-2">
                  <dt className="text-[12px] text-muted">Managers</dt>
                  <dd className="m-0 font-heading text-xl font-bold text-navy">{p.members}</dd>
                </div>
                <div className="rounded-lg bg-surface p-2">
                  <dt className="text-[12px] text-muted">Invited</dt>
                  <dd className="m-0 font-heading text-xl font-bold text-navy">{p.pendingInvitations}</dd>
                </div>
                <div className="rounded-lg bg-surface p-2">
                  <dt className="text-[12px] text-muted">Open reports</dt>
                  <dd className="m-0 font-heading text-xl font-bold text-navy">{p.openReports}</dd>
                </div>
              </dl>
              {!p.connecteamJobId && <p className="mt-3 mb-0 text-[13px] font-semibold text-gold-text">No Connecteam job linked yet</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
