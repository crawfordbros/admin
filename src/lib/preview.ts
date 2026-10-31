import { useUser } from "@clerk/clerk-react";
import { useSearchParams } from "react-router-dom";
import { roleFrom } from "../access";

export const MANAGER_PREVIEW_DENIED = "Only Super Admins can preview what property managers see.";

/**
 * "See what managers see": a Super Admin opens a property's portal pages with
 * ?as=manager. The API then answers as it would for the property's manager, and the pages turn
 * off every change. `query` / `and` carry the flag on to API calls and links.
 */
export function useManagerPreview() {
  const [params] = useSearchParams();
  const { user } = useUser();
  const requested = params.get("as") === "manager";
  const on = requested && roleFrom(user?.publicMetadata) === "super_admin";
  // Keep an explicitly requested preview on API calls so unauthorized URLs get
  // an access error rather than silently opening the user's normal editable view.
  return { on, denied: requested && !on, query: requested ? "?as=manager" : "", and: requested ? "&as=manager" : "" };
}
