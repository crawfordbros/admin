import { useClerk } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";
import { CBES_PHONE } from "./clerkErrors";

export type SessionOutcome = "done" | "setup-mfa";

/**
 * Makes a finished sign-in or sign-up the active session, then goes to `to`. Clerk holds the session
 * as pending while the account still owes a task; the only one this instance asks for is setting up
 * two-step verification (required for new accounts), which the caller then shows.
 */
export function useCompleteSession() {
  const clerk = useClerk();
  const navigate = useNavigate();

  return async (sessionId: string | null | undefined, to: string): Promise<SessionOutcome> => {
    let navigated = false;
    await clerk.setActive({
      session: sessionId,
      navigate: async ({ session }) => {
        if (session.currentTask) return;
        navigated = true;
        navigate(to, { replace: true });
      },
    });
    const task = clerk.session?.currentTask;
    if (task?.key === "setup-mfa") return "setup-mfa";
    if (task) throw new Error(`Your account needs a setup step this portal can't finish. Call CBES at ${CBES_PHONE}.`);
    if (!navigated) navigate(to, { replace: true });
    return "done";
  };
}

/** True when the browser holds a session that is waiting on two-step verification setup. */
export function usePendingMfaSetup() {
  const clerk = useClerk();
  return clerk.session?.currentTask?.key === "setup-mfa";
}
