import { PropertyAddress } from "../components/PropertyAddress";
import { Link, Navigate } from "react-router-dom";
import { ROLE_LABELS, isAdmin as isAdminRole, roleFrom } from "../access";
import { errorMessage } from "../lib/api";
import { usePortalPage } from "../components/admin/adminPage";
import { OrgLogo, PropertyPhoto } from "../components/brand";
import { useMe } from "../components/portal/RepContext";
import { Alert, Loading } from "../components/ui";

const count = (n: number) => `${n} ${n === 1 ? "property" : "properties"}`;
// The whole card is the link's target; the link's name stays the organization or property name.
const card = "relative flex items-center gap-4 rounded-2xl border border-line bg-white p-4 hover:border-field focus-within:border-navy";
const stretched = "font-heading text-[17px] font-bold text-navy-ink no-underline after:absolute after:inset-0 after:rounded-2xl hover:underline";

export function PortalHome() {
  const { data, error, isPending } = useMe();
  usePortalPage("Welcome");

  if (isPending) return <Loading />;
  if (error) return <Alert>{errorMessage(error)}</Alert>;

  const { user, organizations, properties } = data;
  const role = roleFrom({ role: user.role });
  // Admins work from the admin dashboard; a representative of one organization goes straight to it;
  // a manager with one property, to that.
  if (isAdminRole(role)) return <Navigate to="/admin" replace />;
  if (organizations.length === 1) return <Navigate to={`/portal/organizations/${organizations[0].id}`} replace />;
  if (organizations.length === 0 && properties.length === 1) {
    return <Navigate to={`/portal/properties/${properties[0].id}`} replace />;
  }

  const firstName = user.name?.split(" ")[0];
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div>
        <p className="mt-0 mb-1 text-sm font-semibold text-gold-text">{role ? ROLE_LABELS[role] : ""}</p>
        <h1 className="m-0 text-3xl font-bold text-navy-ink">Welcome{firstName ? `, ${firstName}` : ""}</h1>
      </div>

      {organizations.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="m-0 text-xl">Your organizations</h2>
          <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2">
            {organizations.map((o) => (
              <li key={o.id} className={card}>
                <OrgLogo org={o} size={48} />
                <span className="flex min-w-0 flex-col">
                  <Link to={`/portal/organizations/${o.id}`} className={stretched}>
                    {o.name}
                  </Link>
                  <span className="text-[14px] text-muted">{count(o.propertyCount)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {properties.length === 0 ? (
        <p className="m-0 rounded-2xl border border-line bg-white p-6 leading-relaxed text-muted">
          You don't have a property yet. CBES links your account to your property when they invite you. Email office@cbenvironments.com
          if that hasn't happened.
        </p>
      ) : (
        <section className="flex flex-col gap-3">
          <h2 className="m-0 text-xl">Your properties</h2>
          <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2">
            {properties.map((p) => (
              <li key={p.id} className={card}>
                <span className="size-12 flex-none overflow-hidden rounded-xl">
                  <PropertyPhoto orgId={p.organizationId ?? ""} property={p.organizationId ? p : { id: p.id, photoVersion: null }} size={48} />
                </span>
                <span className="flex min-w-0 flex-col">
                  <Link to={`/portal/properties/${p.id}`} className={stretched}>
                    {p.name}
                  </Link>
                  <PropertyAddress property={p} />
                  {(p.organizationName || p.city) && <span className="truncate text-[14px] text-muted">{[p.organizationName].filter(Boolean).join(" · ")}</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
