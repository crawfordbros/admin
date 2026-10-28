import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { errorMessage, useApi, type AdminPropertyDetail } from "../../lib/api";
import { Alert, Loading } from "../../components/ui";
import { useToast } from "../../components/Toast";
import { propertyPath } from "./paths";

// Properties moved inside Organizations (ADMIN_PORTAL_SPEC section 3.2). Old links still work.

/** /admin/properties/new: a property is now added from its organization. */
export function NewPropertyRedirect() {
  const toast = useToast();
  const navigate = useNavigate();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    toast.success("Choose an organization, then add the property.");
    navigate("/admin/organizations", { replace: true });
  }, [toast, navigate]);
  return null;
}

/** /admin/properties/:id goes to the property inside its organization. */
export function PropertyRedirect() {
  const { id = "" } = useParams();
  const api = useApi();
  const { data, error } = useQuery({
    queryKey: ["admin", "property", id],
    queryFn: () => api<AdminPropertyDetail>(`/admin/properties/${id}`),
  });
  if (error) return <Alert>{errorMessage(error)}</Alert>;
  if (!data) return <Loading />;
  const orgId = data.property.organizationId;
  return <Navigate to={orgId ? propertyPath(orgId, id) : "/admin/organizations?unassigned=1"} replace />;
}
