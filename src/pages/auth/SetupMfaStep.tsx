import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useClerk } from "@clerk/clerk-react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";
import QRCode from "qrcode";
import { Alert, Button, Loading } from "../../components/ui";
import { authErrorMessage } from "./clerkErrors";
import { CodeField, StepHeading, TextButton } from "./fields";
import { useSecurityApi, useSecurityStatus, type SecurityStatus } from "./security";
import { loginPathFor } from "./redirect";
import { useAuthCopy } from "./authCopy";
import { ApiError } from "../../lib/authenticatedRequest";
import { loadPasskeyBrowser, PasskeyModuleLoadError } from "../../lib/passkeyBrowser";

/** Every sign-in uses the saved method; only unenrolled accounts choose a method. */
export function SetupMfaStep({ to }: { to: string }) {
  const clerk = useClerk();
  const status = useSecurityStatus();
  const copy = useAuthCopy();
  if (status.isPending) return <Loading label={copy.checkingMethods} />;
  if (status.error) {
    const denied = status.error instanceof ApiError && status.error.details.code === "impersonation_forbidden";
    return <><Alert>{status.error.message}</Alert>{denied
      ? <Button onClick={() => clerk.signOut({ redirectUrl: loginPathFor() })}>{copy.signOut}</Button>
      : <Button onClick={() => void status.refetch()}>{copy.tryAgain}</Button>}</>;
  }
  return <SecurityStep key={clerk.session?.id} to={to} status={status.data} />;
}

/** Async work belongs to the session and mounted step that started it. */
function useCurrentSession() {
  const clerk = useClerk();
  const sessionId = clerk.session?.id;
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  return useCallback(() => mounted.current && Boolean(sessionId) && clerk.session?.id === sessionId, [clerk, sessionId]);
}

function SecurityStep({ to, status }: { to: string; status: SecurityStatus }) {
  const clerk = useClerk();
  const sessionId = clerk.session?.id;
  const isCurrent = useCurrentSession();
  const navigate = useNavigate();
  const queries = useQueryClient();
  const api = useSecurityApi();
  const copy = useAuthCopy();
  const [method, setMethod] = useState<"authenticator" | null>(null);
  const [error, setError] = useState("");
  const [reloadRequired, setReloadRequired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [authenticatorBusy, setAuthenticatorBusy] = useState(false);
  const [authenticatorEnrolled, setAuthenticatorEnrolled] = useState(false);
  const running = useRef(false);
  const automaticAttempted = useRef(false);
  const canUsePasskey = window.isSecureContext && typeof window.PublicKeyCredential === "function";
  const enrolled = status.passkey || status.authenticator || authenticatorEnrolled;

  const finish = useCallback(async () => {
    if (!isCurrent()) return;
    // Refresh the token without reloading the whole session: Clerk can briefly
    // emit an active session without claims while reloading after TOTP setup.
    await clerk.session?.getToken({ skipCache: true });
    if (!isCurrent()) return;
    const current = await api<SecurityStatus>("/status");
    if (!isCurrent()) return;
    if (!current.verified) throw new Error(copy.notVerified);
    if (current.pending || clerk.session?.currentTask) {
      throw new Error(copy.savedSignInAgain);
    }
    await queries.cancelQueries({ queryKey: ["security", sessionId], exact: true });
    if (!isCurrent()) return;
    // Publish the checked status before navigating so the destination cannot start
    // another challenge from stale query data or an earlier in-flight status read.
    // This may unmount this step normally.
    queries.setQueryData(["security", sessionId], current);
    await clerk.setActive({ session: sessionId, navigate: async () => {
      if (clerk.session?.id === sessionId) navigate(to, { replace: true });
    } });
  }, [api, clerk, copy, isCurrent, navigate, queries, sessionId, to]);

  const run = useCallback(async (action: () => Promise<void>) => {
    if (running.current || !isCurrent()) return;
    running.current = true;
    setBusy(true);
    setError("");
    setReloadRequired(false);
    try {
      await action();
    } catch (err) {
      if (isCurrent()) {
        setReloadRequired(err instanceof PasskeyModuleLoadError);
        setError(err && typeof err === "object" && "name" in err && (err.name === "NotAllowedError" || err.name === "AbortError")
          ? copy.passkeyCancelled
          : authErrorMessage(err, copy));
      }
    } finally {
      running.current = false;
      if (isCurrent()) setBusy(false);
    }
  }, [copy, isCurrent]);

  const passkey = useCallback(async () => {
    const { startRegistration, startAuthentication } = await loadPasskeyBrowser();
    if (!isCurrent()) return;
    if (status.passkey) {
      const { options, challengeId } = await api<{ options: PublicKeyCredentialRequestOptionsJSON; challengeId: string }>("/passkeys/authenticate/options", {});
      if (!isCurrent()) return;
      const credential = await startAuthentication({ optionsJSON: options });
      if (!isCurrent()) return;
      await api("/passkeys/authenticate/verify", { challengeId, credential });
    } else {
      const { options, challengeId } = await api<{ options: PublicKeyCredentialCreationOptionsJSON; challengeId: string }>("/passkeys/register/options", {});
      if (!isCurrent()) return;
      const credential = await startRegistration({ optionsJSON: options });
      if (!isCurrent()) return;
      await api("/passkeys/register/verify", { challengeId, credential });
    }
    await finish();
  }, [api, finish, isCurrent, status.passkey]);

  useEffect(() => {
    if (reloadRequired || automaticAttempted.current || running.current || authenticatorBusy) return;
    if (!status.verified && !(status.passkey && canUsePasskey)) return;
    // Set before starting any async work: Strict Mode, refetches, and cancellation
    // must never open a second prompt. Only the retry button starts another attempt.
    automaticAttempted.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- starts external verification and reports its progress
    void run(status.verified ? finish : passkey);
  }, [authenticatorBusy, canUsePasskey, finish, passkey, reloadRequired, run, status.passkey, status.verified]);

  return (
    <>
      <StepHeading title={enrolled ? copy.twoStepTitle : copy.addTwoStepTitle}>
        {enrolled ? copy.twoStepIntroEnrolled : copy.twoStepIntroNew}
      </StepHeading>
      {error && <Alert>{error}</Alert>}
      {reloadRequired ? (
        <Button onClick={() => window.location.reload()}>{copy.reloadPage}</Button>
      ) : status.verified && !authenticatorBusy ? (
        error && !busy ? <Button onClick={() => run(finish)}>{copy.continue}</Button> : <Loading label={copy.finishing} />
      ) : status.passkey ? (
        !canUsePasskey
          ? <p className="text-sm text-muted">{copy.needsHttps}</p>
          : error && !busy
            ? <Button onClick={() => run(passkey)}>{copy.tryPasskeyAgain}</Button>
            : <Loading label={copy.followPrompt} />
      ) : method === "authenticator" || status.authenticator ? (
        <AuthenticatorSetup existing={status.authenticator} onDone={finish}
          onEnrolled={() => setAuthenticatorEnrolled(true)} onBusyChange={setAuthenticatorBusy} />
      ) : (
        <div className="flex flex-col gap-5">
          <div className="rounded-xl border border-line p-5">
            <h2 className="mt-0 mb-2 text-lg font-bold text-navy">{copy.passkey}</h2>
            <p className="mt-0 mb-4 text-sm leading-relaxed text-muted">
              {copy.passkeyBody}
            </p>
            <Button type="button" onClick={() => run(passkey)} disabled={busy || !canUsePasskey}>
              {busy ? copy.followPrompt : copy.createPasskey}
            </Button>
            {!canUsePasskey && <p className="mb-0 text-sm text-muted">{copy.needsHttps}</p>}
          </div>
          <div className="rounded-xl border border-line p-5">
            <h2 className="mt-0 mb-2 text-lg font-bold text-navy">{copy.authenticatorApp}</h2>
            <p className="mt-0 mb-4 text-sm leading-relaxed text-muted">{copy.authenticatorBody}</p>
            <Button type="button" onClick={() => { setError(""); setMethod("authenticator"); }} disabled={busy}>
              {copy.setUpAuthenticator}
            </Button>
          </div>
        </div>
      )}
      <div className="mt-6 flex flex-wrap gap-5">
        {!reloadRequired && method && !enrolled && <TextButton disabled={authenticatorBusy} onClick={() => setMethod(null)}>{copy.backToMethods}</TextButton>}
        <TextButton disabled={busy || authenticatorBusy} onClick={() => void clerk.signOut({ redirectUrl: loginPathFor() })}>{copy.signOut}</TextButton>
      </div>
    </>
  );
}

function AuthenticatorSetup({ existing, onDone, onEnrolled, onBusyChange }: {
  existing: boolean; onDone: () => Promise<void>; onEnrolled: () => void; onBusyChange: (busy: boolean) => void;
}) {
  const clerk = useClerk();
  const isCurrent = useCurrentSession();
  const api = useSecurityApi();
  const queries = useQueryClient();
  const copy = useAuthCopy();
  const user = clerk.session?.user ?? clerk.user;
  const [totp, setTotp] = useState<{ secret: string; qr: string }>();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const started = useRef(false);
  const [enrolled, setEnrolled] = useState(false);
  const [enrollmentCode, setEnrollmentCode] = useState("");

  useEffect(() => {
    if (existing || started.current || !user) return;
    started.current = true;
    void user.createTOTP().then(async (res) => {
      if (!isCurrent()) return;
      if (!res.uri || !res.secret) throw new Error(copy.setupCodeFailed);
      const svg = await QRCode.toString(res.uri, { type: "svg", margin: 0, color: { dark: "#1a1c3d", light: "#ffffff" } });
      if (!isCurrent()) return;
      setTotp({ secret: res.secret, qr: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` });
    }).catch((err: unknown) => { if (isCurrent()) setError(authErrorMessage(err, copy)); });
  }, [copy, existing, isCurrent, user]);

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (!user || !clerk.session || busy || !isCurrent()) return;
    const session = clerk.session;
    setBusy(true);
    onBusyChange(true);
    setError("");
    try {
      if (!existing && !enrolled) {
        await user.verifyTOTP({ code });
        if (!isCurrent()) return;
        setEnrolled(true);
        onEnrolled();
        setEnrollmentCode(code);
        setCode("");
        setTotp(undefined);
        await session.getToken({ skipCache: true });
        if (!isCurrent()) return;
        await queries.invalidateQueries({ queryKey: ["security", session.id] });
        return;
      }
      if (code === enrollmentCode) throw new Error(copy.waitForNewCode);
      // Enrollment alone does not prove a second factor for this sign-in. Ask Clerk
      // to verify it when the current session hasn't already verified that factor.
      if ((session.factorVerificationAge?.[1] ?? -1) < 0) {
        const verification = await session.startVerification({ level: "second_factor" });
        if (!isCurrent()) return;
        if (verification.status === "needs_second_factor") {
          await session.attemptSecondFactorVerification({ strategy: "totp", code });
        } else if (verification.status !== "complete") {
          throw new Error(copy.signOutAndIn);
        }
      }
      if (!isCurrent()) return;
      await api("/authenticator/complete", {});
      if (!isCurrent()) return;
      await onDone();
    } catch (err) { if (isCurrent()) setError(authErrorMessage(err, copy)); }
    finally { if (isCurrent()) { setBusy(false); onBusyChange(false); } }
  }

  return (
    <>
      <p className="mt-0 text-sm leading-relaxed text-muted">
        {enrolled ? copy.authenticatorSaved : existing ? copy.enterAppCode : copy.scanQr}
      </p>
      {!existing && !enrolled && !totp && !error && <Loading label={copy.preparingCode} />}
      {totp && (
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start">
          <img src={totp.qr} alt={copy.qrAlt} width={160} height={160} className="size-40 shrink-0 rounded-lg border border-line p-2.5" />
          <div className="min-w-0 text-sm text-muted">
            <p className="mt-0 mb-1.5">{copy.cantScan}</p>
            <p className="m-0 font-mono text-[15px] font-semibold tracking-wider break-all text-ink select-all">{totp.secret.match(/.{1,4}/g)?.join(" ")}</p>
          </div>
        </div>
      )}
      <form onSubmit={verify} className="flex flex-col gap-5">
        {error && <Alert>{error}</Alert>}
        <CodeField label={copy.codeFromApp} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} disabled={!existing && !enrolled && !totp} />
        <Button type="submit" disabled={(!existing && !enrolled && !totp) || busy}>{busy ? copy.verifying : copy.verifyAndContinue}</Button>
      </form>
    </>
  );
}
