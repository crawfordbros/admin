import { useEffect, useRef, useState, type FormEvent } from "react";
import { useClerk } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";
import QRCode from "qrcode";
import { Alert, Button, Loading } from "../../components/ui";
import { authErrorMessage } from "./clerkErrors";
import { CodeField, StepHeading } from "./fields";

type Totp = { secret: string; qr: string };

/** Enrolls an authenticator app, then finishes the pending session. */
export function SetupMfaStep({ to }: { to: string }) {
  const clerk = useClerk();
  const navigate = useNavigate();
  const [totp, setTotp] = useState<Totp>();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const started = useRef(false);
  const user = clerk.session?.user ?? clerk.user;

  useEffect(() => {
    // Each createTOTP call replaces the unverified secret, so only make one (StrictMode runs effects twice).
    if (started.current || !user) return;
    started.current = true;
    user
      .createTOTP()
      .then(async (res) => {
        if (!res.uri || !res.secret) throw new Error("Clerk didn't return a setup key. Reload the page and try again.");
        const svg = await QRCode.toString(res.uri, { type: "svg", margin: 0, color: { dark: "#1a1c3d", light: "#ffffff" } });
        setTotp({ secret: res.secret, qr: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` });
      })
      .catch((err: unknown) => setError(authErrorMessage(err)));
  }, [user]);

  if (!user) {
    return (
      <StepHeading title="Add two-step verification">
        Your session has ended. Sign in again to finish setting up two-step verification.
      </StepHeading>
    );
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    setError("");
    try {
      await user.verifyTOTP({ code });
      // The task is cleared on Clerk's side; making the session active again picks that up.
      await clerk.setActive({ session: clerk.session?.id, navigate: async () => navigate(to, { replace: true }) });
    } catch (err) {
      setError(authErrorMessage(err));
      setBusy(false);
    }
  }

  return (
    <>
      <StepHeading title="Add two-step verification">
        Scan this code with an authenticator app such as Google Authenticator, Microsoft Authenticator or 1Password. You'll
        enter a code from the app each time you sign in on a new device.
      </StepHeading>

      {!totp && !error && <Loading label="Preparing your setup code…" />}

      {totp && (
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start">
          <img
            src={totp.qr}
            alt="QR code to add the CBES portal to your authenticator app"
            width={160}
            height={160}
            className="size-40 shrink-0 rounded-lg border border-line p-2.5"
          />
          <div className="min-w-0 text-sm text-muted">
            <p className="mt-0 mb-1.5">Can't scan it? Enter this setup key in the app instead:</p>
            <p className="m-0 font-mono text-[15px] font-semibold tracking-wider break-all text-ink select-all">
              {totp.secret.match(/.{1,4}/g)?.join(" ")}
            </p>
          </div>
        </div>
      )}

      <form onSubmit={verify} className="flex flex-col gap-5">
        {error && <Alert>{error}</Alert>}
        <CodeField
          label="Code from the app"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          disabled={!totp}
        />
        <Button type="submit" disabled={!totp || busy}>
          {busy ? "Turning on…" : "Turn on two-step verification"}
        </Button>
      </form>
    </>
  );
}
