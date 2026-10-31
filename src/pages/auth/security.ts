import { useCallback } from "react";
import { useClerk } from "@clerk/clerk-react";
import { useQuery } from "@tanstack/react-query";
import { authenticatedRequest, responseJson } from "../../lib/authenticatedRequest";

export type SecurityStatus = { passkey: boolean; authenticator: boolean; verified: boolean; pending: boolean };

/** These limited endpoints can enroll a pending user; regular API access still requires completed MFA. */
export function useSecurityApi() {
  const clerk = useClerk();
  return useCallback(async <T,>(path: string, body?: unknown, method?: "DELETE"): Promise<T> => {
    const session = clerk.session;
    const res = await authenticatedRequest({ sessionId: session?.id, getToken: async (options) => await session?.getToken(options) ?? null }, `/auth/mfa${path}`, {
      method: method ?? (body === undefined ? "GET" : "POST"),
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
    });
    return responseJson<T>(res);
  }, [clerk]);
}

export function useSecurityStatus() {
  const clerk = useClerk();
  const api = useSecurityApi();
  return useQuery({
    queryKey: ["security", clerk.session?.id],
    queryFn: () => api<SecurityStatus>("/status"),
    enabled: Boolean(clerk.session),
    retry: false,
    staleTime: 0,
  });
}
