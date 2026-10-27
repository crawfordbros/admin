import { useUser } from "@clerk/clerk-react";
import { useParams } from "react-router-dom";
import { roleFrom } from "../../access";
import { OrganizationView } from "../org/OrganizationView";

/** A representative's home: their organization's properties and people. */
export function OrganizationPage() {
  const { id = "" } = useParams();
  const { user } = useUser();
  return <OrganizationView id={id} area="portal" isAdmin={roleFrom(user?.publicMetadata) === "admin"} />;
}
