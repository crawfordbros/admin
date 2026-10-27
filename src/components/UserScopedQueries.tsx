import { useMemo, type ReactNode } from "react";
import { useAuth } from "@clerk/clerk-react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createQueryClient } from "../lib/queryClient";

/**
 * One query cache per signed-in person. Signing out and in as someone else on the same tab starts
 * with an empty cache, so nobody sees the previous person's property data, even for a moment.
 */
export function UserScopedQueries({ children }: { children: ReactNode }) {
  const { userId } = useAuth();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- a new cache is wanted exactly when userId changes
  const client = useMemo(() => createQueryClient(), [userId]);
  // The key remounts the pages too: a mounted query keeps its original cache otherwise.
  return (
    <QueryClientProvider key={userId ?? "signed-out"} client={client}>
      {children}
    </QueryClientProvider>
  );
}
