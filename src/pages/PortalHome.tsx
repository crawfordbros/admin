import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, Navigate } from "react-router-dom";
import { ROLE_LABELS, roleFrom } from "../access";
import { errorMessage, useApi, type Me } from "../lib/api";
import { Alert, Loading } from "../components/ui";

export function PortalHome() {
  const api = useApi();
  const { data, error, isPending } = useQuery({ queryKey: ["me"], queryFn: () => api<Me>("/portal/me") });
  useEffect(() => {
    document.title = "Portal | CBES";
  }, []);

  if (isPending) return <Loading />;
  if (error) return <Alert>{errorMessage(error)}</Alert>;

  const { user, properties } = data;
  const isAdmin = user.role === "admin";
  // A manager with a single property goes straight to it.
  if (!isAdmin && properties.length === 1) return <Navigate to={`/portal/properties/${properties[0].id}`} replace />;

  const role = roleFrom({ role: user.role });
  const firstName = user.name?.split(" ")[0];
  return (
    <div className="mx-auto max-w-4xl">
      <p className="mt-0 mb-1 text-sm font-semibold text-gold-text">{role ? ROLE_LABELS[role] : ""}</p>
      <h1 className="mt-0 mb-6 text-3xl font-bold text-navy">Welcome{firstName ? `, ${firstName}` : ""}</h1>

      {isAdmin && (
        <p className="mt-0 mb-6">
          <Link to="/admin" className="font-bold">
            Go to the admin dashboard
          </Link>
        </p>
      )}

      {properties.length === 0 ? (
        <p className="rounded-xl border border-line bg-white p-6 leading-relaxed text-muted">
          You don't have a property yet. CBES links your account to your property when they invite you. Call (470) 585-2776 if
          that hasn't happened.
        </p>
      ) : (
        <>
          <h2 className="mt-0 mb-3 text-xl">{isAdmin ? "All properties" : "Your properties"}</h2>
          <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2">
            {properties.map((p) => (
              <li key={p.id} className="rounded-xl border border-line bg-white p-5">
                <h3 className="m-0 text-lg">
                  <Link to={`/portal/properties/${p.id}`}>{p.name}</Link>
                </h3>
                {p.city && <p className="mt-1 mb-0 text-[15px] text-muted">{p.city}</p>}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
