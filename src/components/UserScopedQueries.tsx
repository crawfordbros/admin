import { useEffect, useMemo, type ReactNode } from "react";
import { useAuth } from "@clerk/clerk-react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createQueryClient } from "../lib/queryClient";
import { releaseSession } from "../lib/sessionState";
import { clearTokenRefresh } from "../lib/authenticatedRequest";

/**
 * One query cache per identity and session. Reauthentication starts with an empty cache,
 * even for the same person, so stale protected data cannot survive a sign-out.
 */
export function UserScopedQueries({ children }: { children: ReactNode }) {
  const { userId, sessionId } = useAuth();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- replace the cache exactly when identity/session changes
  const client = useMemo(() => createQueryClient(), [userId, sessionId]);
  useEffect(() => () => {
    void client.cancelQueries();
    client.clear();
    if (sessionId) { releaseSession(sessionId); clearTokenRefresh(sessionId); }
  }, [client, sessionId]);
  // The key remounts the pages too: a mounted query keeps its original cache otherwise.
  return (
    <QueryClientProvider key={`${userId ?? "signed-out"}:${sessionId ?? "none"}`} client={client}>
      {children}
    </QueryClientProvider>
  );
}
