import { useCallback } from "react";
import { useClerk } from "@clerk/clerk-react";
import type { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";
import { ApiError, useApi } from "./api";
import { useSecurityStatus } from "../pages/auth/security";

export type StepUpMethod = "passkey" | "authenticator";

/**
 * Re-confirms the Super Admin right before adding, upgrading or removing an admin
 * (ADMIN_PORTAL_SPEC 2.3). Passkey when there is one; otherwise a code from the authenticator app,
 * checked by Clerk. Resolves to a single-use token the API accepts for 5 minutes.
 */
export function useStepUp() {
  const api = useApi();
  const clerk = useClerk();
  const status = useSecurityStatus();
  const method: StepUpMethod | null = status.data?.passkey ? "passkey" : status.data?.authenticator ? "authenticator" : null;

  const confirm = useCallback(
    async (code?: string): Promise<string> => {
      if (method === "passkey") {
        const { startAuthentication } = await import("@simplewebauthn/browser");
        const { options, challengeId } = await api<{ options: PublicKeyCredentialRequestOptionsJSON; challengeId: string }>("/auth/step-up/options", { method: "POST", body: "{}" });
        let credential;
        try {
          credential = await startAuthentication({ optionsJSON: options });
        } catch (err) {
          if (err && typeof err === "object" && "name" in err && (err.name === "NotAllowedError" || err.name === "AbortError")) {
            throw new Error("The passkey prompt was cancelled or timed out. Try again when you're ready.", { cause: err });
          }
          throw err;
        }
        const { stepUpToken } = await api<{ stepUpToken: string }>("/auth/step-up/verify", { method: "POST", body: JSON.stringify({ challengeId, credential }) });
        return stepUpToken;
      }
      const session = clerk.session;
      if (!session) throw new Error("Your session has ended. Sign in again.");
      if (!code || !/^\d{6}$/.test(code)) throw new Error("Enter the 6-digit code from your authenticator app.");
      await session.startVerification({ level: "second_factor" });
      try {
        await session.attemptSecondFactorVerification({ strategy: "totp", code });
      } catch (err) {
        throw new Error("That code didn't work. Check the app and try the newest code.", { cause: err });
      }
      // A fresh token carries the new verification time the API checks.
      const token = await session.getToken({ skipCache: true });
      const res = await fetch("/api/auth/step-up/authenticator", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      const body = (await res.json().catch(() => ({}))) as { stepUpToken?: string; error?: string };
      if (!res.ok || !body.stepUpToken) throw new ApiError(res.status, body.error ?? "We couldn't confirm it's you. Try again.");
      return body.stepUpToken;
    },
    [api, clerk, method],
  );

  return { method, loading: status.isPending, confirm };
}
