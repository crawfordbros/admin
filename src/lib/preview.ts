import { useUser } from "@clerk/clerk-react";
import { useSearchParams } from "react-router-dom";
import { isAdmin, roleFrom } from "../access";

/**
 * "See what managers see" (ADMIN_PORTAL_SPEC 7.10): an admin opens a property's portal pages with
 * ?as=manager. The API then answers as it would for the property's manager, and the pages turn
 * off every change. `query` / `and` carry the flag on to API calls and links.
 */
export function useManagerPreview() {
  const [params] = useSearchParams();
  const { user } = useUser();
  const on = params.get("as") === "manager" && isAdmin(roleFrom(user?.publicMetadata));
  return { on, query: on ? "?as=manager" : "", and: on ? "&as=manager" : "" };
}
