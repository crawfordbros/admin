import { useEffect, useRef, useState, type FormEvent } from "react";
import { useClerk } from "@clerk/clerk-react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";
import QRCode from "qrcode";
import { Alert, Button, Loading } from "../../components/ui";
import { authErrorMessage } from "./clerkErrors";
import { CodeField, StepHeading, TextButton } from "./fields";
import { useSecurityApi, useSecurityStatus, type SecurityStatus } from "./security";

/** Both choices are enforced by the API for every account, including Google users. */
export function SetupMfaStep({ to }: { to: string }) {
  const clerk = useClerk();
  const navigate = useNavigate();
  const queries = useQueryClient();
  const api = useSecurityApi();
  const status = useSecurityStatus();
  const [method, setMethod] = useState<"authenticator" | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const canUsePasskey = window.isSecureContext && typeof window.PublicKeyCredential === "function";

  async function finish() {
    // Refresh the token without reloading the whole session: Clerk can briefly
    // emit an active session without claims while reloading after TOTP setup.
    await clerk.session?.getToken({ skipCache: true });
    const current = await api<SecurityStatus>("/status");
    if (!current.verified) throw new Error("Complete two-step verification before continuing.");
    if (current.pending || clerk.session?.currentTask) {
      throw new Error("Your security method is saved. Sign out and sign in again to finish updating your session.");
    }
    await queries.invalidateQueries({ queryKey: ["security"] });
    await clerk.setActive({ session: clerk.session?.id, navigate: async () => navigate(to, { replace: true }) });
  }

  async function passkey() {
    if (!status.data) return;
    setBusy(true);
    setError("");
    try {
      const { startRegistration, startAuthentication } = await import("@simplewebauthn/browser");
      if (status.data.passkey) {
        const { options, challengeId } = await api<{ options: PublicKeyCredentialRequestOptionsJSON; challengeId: string }>("/passkeys/authenticate/options", {});
        const credential = await startAuthentication({ optionsJSON: options });
        await api("/passkeys/authenticate/verify", { challengeId, credential });
      } else {
        const { options, challengeId } = await api<{ options: PublicKeyCredentialCreationOptionsJSON; challengeId: string }>("/passkeys/register/options", {});
        const credential = await startRegistration({ optionsJSON: options });
        await api("/passkeys/register/verify", { challengeId, credential });
      }
      await finish();
    } catch (err) {
      setError(err && typeof err === "object" && "name" in err && (err.name === "NotAllowedError" || err.name === "AbortError")
        ? "The passkey prompt was cancelled or timed out. Try again when you're ready."
        : authErrorMessage(err));
    } finally { setBusy(false); }
  }

  if (status.isPending) return <Loading label="Checking your security methods…" />;
  if (status.error) return <><Alert>{status.error.message}</Alert><Button onClick={() => void status.refetch()}>Try again</Button></>;
  const enrolled = status.data.passkey || status.data.authenticator;

  return (
    <>
      <StepHeading title={enrolled ? "Two-step verification" : "Add two-step verification"}>
        {enrolled
          ? "Verify with your saved security method to enter the portal."
          : "Choose a passkey or an authenticator app. Every CBES account must complete this step, including accounts that use Google."}
      </StepHeading>
      {error && <Alert>{error}</Alert>}
      {method === "authenticator" ? (
        <AuthenticatorSetup existing={status.data.authenticator} onDone={finish} />
      ) : (
        <div className="flex flex-col gap-5">
          {(!enrolled || status.data.passkey) && (
            <div className="rounded-xl border border-line p-5">
              <h2 className="mt-0 mb-2 text-lg font-bold text-navy">Passkey</h2>
              <p className="mt-0 mb-4 text-sm leading-relaxed text-muted">
                Use Face ID, Touch ID, Windows Hello, your device PIN, or a security key. No authenticator app is needed.
              </p>
              <Button type="button" onClick={() => void passkey()} disabled={busy || !canUsePasskey}>
                {busy ? "Follow your device's prompt…" : status.data.passkey ? "Verify with passkey" : "Create a passkey"}
              </Button>
              {!canUsePasskey && <p className="mb-0 text-sm text-muted">Open this page over HTTPS in a browser that supports passkeys.</p>}
            </div>
          )}
          {(!enrolled || status.data.authenticator) && (
            <div className="rounded-xl border border-line p-5">
              <h2 className="mt-0 mb-2 text-lg font-bold text-navy">Authenticator app</h2>
              <p className="mt-0 mb-4 text-sm leading-relaxed text-muted">Use a six-digit code from Google Authenticator, Microsoft Authenticator, 1Password, or another authenticator app.</p>
              <Button type="button" onClick={() => { setError(""); setMethod("authenticator"); }} disabled={busy}>
                {status.data.authenticator ? "Use authenticator app" : "Set up authenticator app"}
              </Button>
            </div>
          )}
        </div>
      )}
      <div className="mt-6 flex flex-wrap gap-5">
        {method && <TextButton onClick={() => setMethod(null)}>Back to security methods</TextButton>}
        <TextButton disabled={busy} onClick={() => void clerk.signOut({ redirectUrl: "/portal/login" })}>Sign out</TextButton>
      </div>
    </>
  );
}

function AuthenticatorSetup({ existing, onDone }: { existing: boolean; onDone: () => Promise<void> }) {
  const clerk = useClerk();
  const api = useSecurityApi();
  const queries = useQueryClient();
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
      if (!res.uri || !res.secret) throw new Error("We couldn't prepare your setup code. Reload the page and try again.");
      const svg = await QRCode.toString(res.uri, { type: "svg", margin: 0, color: { dark: "#1a1c3d", light: "#ffffff" } });
      setTotp({ secret: res.secret, qr: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` });
    }).catch((err: unknown) => setError(authErrorMessage(err)));
  }, [existing, user]);

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (!user || !clerk.session) return;
    setBusy(true);
    setError("");
    try {
      if (!existing && !enrolled) {
        await user.verifyTOTP({ code });
        await clerk.session.getToken({ skipCache: true });
        setEnrolled(true);
        setEnrollmentCode(code);
        setCode("");
        setTotp(undefined);
        await queries.invalidateQueries({ queryKey: ["security"] });
        return;
      }
      if (code === enrollmentCode) throw new Error("Wait for a new code in your authenticator app, then enter it here.");
      // Enrollment alone does not prove a second factor for this sign-in. Ask Clerk
      // to verify it when the current session hasn't already verified that factor.
      if ((clerk.session.factorVerificationAge?.[1] ?? -1) < 0) {
        const verification = await clerk.session.startVerification({ level: "second_factor" });
        if (verification.status === "needs_second_factor") {
          await clerk.session.attemptSecondFactorVerification({ strategy: "totp", code });
        } else if (verification.status !== "complete") {
          throw new Error("Sign out and sign in again, then enter your authenticator code.");
        }
      }
      await api("/authenticator/complete", {});
      await onDone();
    } catch (err) { setError(authErrorMessage(err)); }
    finally { setBusy(false); }
  }

  return (
    <>
      <p className="mt-0 text-sm leading-relaxed text-muted">
        {enrolled ? "Your authenticator is saved. Wait for the code to change, then enter the new code to verify this sign-in."
          : existing ? "Enter the six-digit code from your authenticator app." : "Scan this QR code with your authenticator app, then enter its six-digit code."}
      </p>
      {!existing && !enrolled && !totp && !error && <Loading label="Preparing your setup code…" />}
      {totp && (
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start">
          <img src={totp.qr} alt="QR code to add the CBES portal to your authenticator app" width={160} height={160} className="size-40 shrink-0 rounded-lg border border-line p-2.5" />
          <div className="min-w-0 text-sm text-muted">
            <p className="mt-0 mb-1.5">Can't scan it? Enter this setup key in the app instead:</p>
            <p className="m-0 font-mono text-[15px] font-semibold tracking-wider break-all text-ink select-all">{totp.secret.match(/.{1,4}/g)?.join(" ")}</p>
          </div>
        </div>
      )}
      <form onSubmit={verify} className="flex flex-col gap-5">
        {error && <Alert>{error}</Alert>}
        <CodeField label="Code from the app" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} disabled={!existing && !enrolled && !totp} />
        <Button type="submit" disabled={(!existing && !enrolled && !totp) || busy}>{busy ? "Verifying…" : "Verify code and continue"}</Button>
      </form>
    </>
  );
}
