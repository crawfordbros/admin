import { useCallback } from "react";
import { useClerk } from "@clerk/clerk-react";
import { useQuery } from "@tanstack/react-query";

export type SecurityStatus = { passkey: boolean; authenticator: boolean; verified: boolean; pending: boolean };

/** These limited endpoints can enroll a pending user; regular API access still requires completed MFA. */
export function useSecurityApi() {
  const clerk = useClerk();
  return useCallback(async <T,>(path: string, body?: unknown): Promise<T> => {
    const token = await clerk.session?.getToken({ skipCache: true });
    if (!token) throw new Error("Your session has ended. Sign in again.");
    const res = await fetch(`/api/auth/mfa${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
    });
    if (res.headers.get("cf-mitigated") === "challenge") {
      throw new Error("The site's security service interrupted verification. Reload this page and try again.");
    }
    const result = await res.json().catch(() => {
      throw new Error("The verification service is temporarily unavailable. Reload this page and try again.");
    });
    if (!res.ok) throw new Error(result.error ?? "We couldn't verify your security method. Try again.");
    return result as T;
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
