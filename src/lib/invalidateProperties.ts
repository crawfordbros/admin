import type { QueryClient } from "@tanstack/react-query";

/** Property names/locations occur throughout the portal, including cached search results. */
export function invalidateProperties(client: QueryClient) {
  return Promise.all(["me", "property", "organization", "organizations", "admin", "rep", "portal", "search"].map((key) => client.invalidateQueries({ queryKey: [key] })));
}
