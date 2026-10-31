import { useEffect, useRef, useState, type ReactNode } from "react";
import { useClerk } from "@clerk/clerk-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { authenticatedRequest, responseJson, clearTokenRefresh } from "../lib/authenticatedRequest";
import { clearPendingWrites } from "../lib/api";
import { clearOfflineCopies } from "../lib/steward/offline";
import { PortalActivity, type ActivitySnapshot, type SessionStatus } from "../lib/portalActivity";
import { AUTH_EVENT, endedKey, endReason, endSession, IDLE_MS, type AuthEvent, type EndReason } from "../lib/sessionState";
import { afterSignInPath, homeFor, loginPathFor } from "../pages/auth/redirect";
import { AUTH_EN } from "../pages/auth/authCopy";
import { AuthLayout } from "../pages/auth/AuthLayout";
import { Alert, Button, Loading } from "./ui";
import { useFocusTrap } from "./useFocusTrap";

/** Sits above all routes so authentication failures cannot become page errors or login loops. */
export function PortalSessionBoundary({ children }: { children: ReactNode }) {
  const clerk = useClerk();
  const id = clerk.session?.id;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [blocked, setBlocked] = useState<EndReason | null>(() => id ? endReason(id) : null);
  const [failed, setFailed] = useState(false);
  const locationRef = useRef(location);
  useEffect(() => { locationRef.current = location; }, [location]);
  const retry = useRef<() => void>(() => {});

  useEffect(() => {
    if (!id) return;
    const session = clerk.session;
    let mounted = true;
    let working = false;
    const finish = async (reason: EndReason) => {
      if (working || clerk.session?.id !== id) return;
      working = true;
      setBlocked(reason);
      setFailed(false);
      void queryClient.cancelQueries();
      queryClient.clear();
      clearPendingWrites();
      // Steward app copies kept on the device (Tonight, the profile, reply drafts) go with the session.
      clearOfflineCopies();
      clearTokenRefresh(id);
      const here = locationRef.current;
      const loginPath = loginPathFor(here.pathname);
      const home = homeFor(here.pathname);
      const target = here.pathname.startsWith(loginPath)
        ? afterSignInPath(here.search, undefined, home)
        : afterSignInPath(`?redirect_url=${encodeURIComponent(here.pathname + here.search + here.hash)}`, undefined, home);
      const login = `${loginPath}?reason=${reason === "idle" ? "inactivity" : reason}&redirect_url=${encodeURIComponent(target)}`;
      navigate(login, { replace: true });
      // Persist the server tombstone when possible, but never leave protected content on screen
      // while waiting for the API or Clerk to come back online.
      const abort = new AbortController();
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          authenticatedRequest({ sessionId: id, getToken: async (options) => await session?.getToken(options) ?? null }, "/auth/session/end", { method: "POST", signal: abort.signal }, { ending: true }),
          new Promise<never>((_, reject) => { timeout = setTimeout(() => { abort.abort(); reject(new Error("offline")); }, 2500); }),
        ]);
      } catch { /* Local lock and server inactivity enforcement remain in place. */ }
      finally { clearTimeout(timeout); }
      if (!mounted || clerk.session?.id !== id) { working = false; return; }
      try {
        await clerk.signOut({ sessionId: id, redirectUrl: login });
      } catch {
        if (mounted) setFailed(true);
      } finally { working = false; }
    };
    retry.current = () => { const reason = endReason(id); if (reason) void finish(reason); };
    const onAuth = (event: Event) => {
      const detail = (event as CustomEvent<AuthEvent>).detail;
      if (detail.sessionId !== id) return;
      if (detail.code === "mfa_required") {
        queryClient.setQueryData(["security", id], (old: Record<string, unknown> | undefined) => old ? { ...old, verified: false } : undefined);
        void queryClient.invalidateQueries({ queryKey: ["security", id] });
      } else void finish(endReason(id) ?? (detail.code === "session_idle_timeout" ? "idle" : "expired"));
    };
    const onStorage = (event: StorageEvent) => {
      const reason = endReason(id);
      if (event.key === endedKey(id) && reason) endSession(id, reason);
    };
    const online = () => retry.current();
    window.addEventListener(AUTH_EVENT, onAuth);
    window.addEventListener("storage", onStorage);
    window.addEventListener("online", online);
    retry.current();
    return () => {
      mounted = false;
      window.removeEventListener(AUTH_EVENT, onAuth);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("online", online);
    };
  }, [clerk, id, navigate, queryClient]);

  if (id && blocked) return <AuthLayout>
    {blocked !== "signout" && <p role="status">{blocked === "idle" ? AUTH_EN.inactivity : AUTH_EN.expired}</p>}
    {failed ? <><p>Connect to the internet to finish signing out.</p><Button onClick={() => retry.current()}>Return to sign in</Button></> : <Loading label={blocked === "signout" ? "Signing you out…" : "Returning to sign in…"} />}
  </AuthLayout>;
  return <>{children}</>;
}

/** Mounted only after the server confirms MFA, around both admin and organization routes. */
export function PortalSessionActivity({ children }: { children: ReactNode }) {
  const clerk = useClerk();
  const id = clerk.session!.id;
  const [snapshot, setSnapshot] = useState<ActivitySnapshot>({ ready: false, remaining: IDLE_MS, warning: false, error: "" });
  const controller = useRef<PortalActivity | null>(null);
  useEffect(() => {
    const session = clerk.session;
    const auth = { sessionId: id, getToken: async (options?: { skipCache?: boolean }) => await session?.getToken(options) ?? null };
    const activity = new PortalActivity({
      sessionId: id,
      status: async () => responseJson<SessionStatus>(await authenticatedRequest(auth, "/auth/session")),
      sendActivity: async (activityAgeMs) => responseJson<SessionStatus>(await authenticatedRequest(auth, "/auth/session/activity", { method: "POST", body: JSON.stringify({ activityAgeMs }), keepalive: true })),
      change: setSnapshot,
    });
    controller.current = activity;
    const input = (event: Event) => activity.interact(event.isTrusted);
    const events = ["pointerdown", "pointermove", "keydown", "touchstart", "wheel"];
    for (const event of events) document.addEventListener(event, input, { passive: true, capture: true });
    void activity.start();
    return () => {
      for (const event of events) document.removeEventListener(event, input, { capture: true });
      activity.stop();
    };
  }, [clerk, id]);
  if (!snapshot.ready) return <AuthLayout>{snapshot.error
    ? <><Alert>{snapshot.error}</Alert><Button onClick={() => void controller.current?.start()}>Try again</Button></>
    : <Loading label="Opening your portal…" />}</AuthLayout>;
  return <>
    {children}
    {snapshot.error && <div role="status" className="fixed bottom-4 left-4 z-[70] max-w-md rounded-xl bg-white p-4 shadow-lg">{snapshot.error}</div>}
    {snapshot.warning && <IdleWarning remaining={snapshot.remaining} onStay={() => controller.current?.interact(true, true)} onSignOut={() => endSession(id, "signout")} />}
  </>;
}

function IdleWarning({ remaining, onStay, onSignOut }: { remaining: number; onStay: () => void; onSignOut: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  useFocusTrap(panel, () => {});
  const seconds = Math.ceil(remaining / 1000);
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-navy-night/70 p-4">
    <div ref={panel} role="alertdialog" aria-modal="true" aria-labelledby="idle-title" aria-describedby="idle-description" tabIndex={-1} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
      <h2 id="idle-title" className="text-xl font-bold text-navy">Are you still here?</h2>
      <p id="idle-description">Your portal session ends after 30 minutes of inactivity. Stay signed in to continue working.</p>
      <p aria-live="off" className="font-semibold">Signing out in {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</p>
      <div className="mt-5 flex gap-3"><Button data-autofocus onClick={onStay}>Stay signed in</Button><Button onClick={onSignOut}>Sign out</Button></div>
    </div>
  </div>;
}
