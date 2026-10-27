import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { errorMessage, useApi, type AdminPropertyDetail, type Property } from "../../lib/api";
import { CONTRACT_LABELS, PROPERTY_ROLE_LABELS } from "../../lib/format";
import { Alert, Button, ButtonLink, Card, Loading } from "../../components/ui";
import { PropertyForm } from "./PropertyForm";
import { propertyPayload } from "./propertyPayload";

export function NewPropertyPage() {
  const api = useApi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  useEffect(() => {
    document.title = "Add a property | CBES Admin";
  }, []);

  return (
    <div className="mx-auto max-w-3xl">
      <p className="mt-0 mb-2 text-[15px]">
        <Link to="/admin/properties">Properties</Link>
      </p>
      <h1 className="mt-0 mb-6 text-3xl font-bold text-navy">Add a property</h1>
      <Card>
        <PropertyForm
          submitLabel="Add property"
          onSubmit={async (values) => {
            const { property } = await api<{ property: Property }>("/admin/properties", {
              method: "POST",
              body: JSON.stringify(propertyPayload(values)),
            });
            await queryClient.invalidateQueries({ queryKey: ["admin", "properties"] });
            navigate(`/admin/properties/${property.id}`);
          }}
        />
      </Card>
    </div>
  );
}

function Details({ property }: { property: Property }) {
  const rows: [string, ReactNode][] = [
    ["Organization", property.organizationId && <Link to={`/admin/organizations/${property.organizationId}`}>{property.organizationName}</Link>],
    ["Address", [property.address, property.city].filter(Boolean).join(", ")],
    ["County", property.county],
    ["Units", property.unitCount],
    ["Service start", property.serviceStartDate],
    ["Contract", property.contractType ? CONTRACT_LABELS[property.contractType] : null],
    ["Connecteam job", property.connecteamJobId],
    ["Resident QR link", `/report?p=${property.slug}`],
  ];
  return (
    <dl className="m-0 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {rows.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-[13px] text-muted">{k}</dt>
          <dd className="m-0 break-words">{v || <span className="text-muted">Not set</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

export function PropertyAdminPage() {
  const { id = "" } = useParams();
  const api = useApi();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const key = ["admin", "property", id];
  const { data, error, isPending } = useQuery({ queryKey: key, queryFn: () => api<AdminPropertyDetail>(`/admin/properties/${id}`) });

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: key }),
      queryClient.invalidateQueries({ queryKey: ["admin", "properties"] }),
    ]);

  useEffect(() => {
    if (data) document.title = `${data.property.name} | CBES Admin`;
  }, [data]);

  if (isPending) return <Loading />;
  if (error) return <Alert>{errorMessage(error)}</Alert>;
  const { property, members, invitations } = data;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <div>
        <p className="mt-0 mb-2 text-[15px]">
          <Link to="/admin/properties">Properties</Link>
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="m-0 text-3xl font-bold text-navy">{property.name}</h1>
          <ButtonLink to={`/portal/properties/${property.id}`} variant="outline" className="w-full sm:w-auto">
            See what managers see
          </ButtonLink>
        </div>
      </div>

      {notice && <Alert tone="success">{notice}</Alert>}

      <Card
        title="Details"
        action={
          !editing && (
            <Button variant="outline" onClick={() => setEditing(true)}>
              Edit
            </Button>
          )
        }
      >
        {editing ? (
          <PropertyForm
            initial={property}
            submitLabel="Save changes"
            onSubmit={async (values) => {
              await api(`/admin/properties/${property.id}`, { method: "PATCH", body: JSON.stringify(propertyPayload(values)) });
              await refresh();
              setEditing(false);
              setNotice("Property saved.");
            }}
          />
        ) : (
          <Details property={property} />
        )}
      </Card>

      <Card title="Who can see it">
        {members.length === 0 && invitations.length === 0 ? (
          <p className="mt-0 mb-4 text-muted">No property managers or Directors yet.</p>
        ) : (
          <ul className="m-0 mb-4 flex list-none flex-col divide-y divide-line p-0">
            {members.map((m) => (
              <li key={m.id} className="py-3">
                <p className="m-0 font-semibold break-words">{m.name ?? m.email}</p>
                <p className="m-0 text-[14px] break-words text-muted">{[m.name ? m.email : null, PROPERTY_ROLE_LABELS[m.role]].filter(Boolean).join(", ")}</p>
              </li>
            ))}
            {invitations.map((i) => (
              <li key={i.id} className="py-3">
                <p className="m-0 font-semibold break-words">{i.name ?? i.email}</p>
                <p className="m-0 text-[14px] break-words text-muted">
                  {[i.name ? i.email : null, PROPERTY_ROLE_LABELS[i.role]].filter(Boolean).join(", ")}.{" "}
                  <span className="font-semibold text-gold-text">Invitation sent</span>
                </p>
              </li>
            ))}
          </ul>
        )}
        {property.organizationId ? (
          <p className="m-0">
            Invite or remove people from{" "}
            <Link to={`/admin/organizations/${property.organizationId}`} className="font-semibold">
              {property.organizationName}
            </Link>
            . Its representatives also see this property.
          </p>
        ) : (
          <p className="m-0 font-semibold text-gold-text">Assign an organization (Edit, above) to invite people to this property.</p>
        )}
      </Card>
    </div>
  );
}
