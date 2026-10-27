import { QueryClient } from "@tanstack/react-query";

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // 401/403/404/422 won't fix themselves on a retry.
        retry: (count, err) => count < 2 && !(err instanceof Error && "status" in err && [401, 403, 404, 422].includes(err.status as number)),
      },
    },
  });
}
