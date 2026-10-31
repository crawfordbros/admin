import { useCallback } from "react";
import { useClerk } from "@clerk/clerk-react";
import type { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";
import { useApi } from "./api";
import { authenticatedRequest, responseJson, SessionTransition } from "./authenticatedRequest";
import { endSession } from "./sessionState";
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
  const sessionId = clerk.session?.id;
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
      if (!session) {
        if (sessionId) endSession(sessionId, "expired");
        throw new SessionTransition();
      }
      if (!code || !/^\d{6}$/.test(code)) throw new Error("Enter the 6-digit code from your authenticator app.");
      await session.startVerification({ level: "second_factor" });
      try {
        await session.attemptSecondFactorVerification({ strategy: "totp", code });
      } catch (err) {
        throw new Error("That code didn't work. Check the app and try the newest code.", { cause: err });
      }
      // A fresh token carries the new verification time the API checks.
      const res = await authenticatedRequest({ sessionId: session.id, getToken: (options) => session.getToken(options) }, "/auth/step-up/authenticator", { method: "POST" }, { forceRefresh: true });
      const body = await responseJson<{ stepUpToken: string }>(res);
      return body.stepUpToken;
    },
    [api, clerk, method, sessionId],
  );

  return { method, loading: status.isPending, confirm };
}
