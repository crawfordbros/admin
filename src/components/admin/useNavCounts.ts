import { useQuery } from "@tanstack/react-query";
import { useApi, type NavCounts } from "../../lib/api";

/** Sidebar badge counts. Until the API serves them, the sidebar shows none. */
export function useNavCounts() {
  const api = useApi();
  return useQuery({
    queryKey: ["admin", "nav-counts"],
    queryFn: () => api<NavCounts>("/admin/nav-counts"),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
}
