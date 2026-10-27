import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useAuth, useSignIn } from "@clerk/clerk-react";
import { isClerkAPIResponseError } from "@clerk/clerk-react/errors";
import { Navigate, useLocation, useSearchParams } from "react-router-dom";
import { Alert, Button, Loading, TextField } from "../components/ui";
import { AuthLayout } from "./auth/AuthLayout";
import { ACCESS_NOTE, apiErrorMessage, authErrorMessage, CBES_EMAIL } from "./auth/clerkErrors";
import { CodeField, PasswordField, SignedInAs, StepHeading, TextButton } from "./auth/fields";
import { afterSignInPath } from "./auth/redirect";
import { SetupMfaStep } from "./auth/SetupMfaStep";
import { useCompleteSession, usePendingMfaSetup } from "./auth/session";

type SignIn = NonNullable<ReturnType<typeof useSignIn>["signIn"]>;

type Step =
  | { name: "email" }
  | { name: "password" }
  | { name: "email-code"; emailAddressId: string }
  | { name: "second-factor"; strategy: "totp" | "email_code"; sentTo?: string }
  | { name: "reset-code" }
  | { name: "new-password" }
  | { name: "setup-mfa" }
  | { name: "working"; label: string };

const RESEND_SECONDS = 30;

/** Staff and manager sign-in. Accounts are invite-only, so there is no way to sign up here. */
export function LoginPage() {
  const { isLoaded, signIn } = useSignIn();
  const { isSignedIn } = useAuth();
  const pendingMfa = usePendingMfaSetup();
  const { search } = useLocation();
  const [params] = useSearchParams();
  const to = afterSignInPath(search);

  useEffect(() => {
    document.title = "Sign in | CBES Portal";
  }, []);

  if (!isLoaded) {
    return (
      <AuthLayout>
        <Loading />
      </AuthLayout>
    );
  }
  if (isSignedIn) return <Navigate to={to} replace />;

  return (
    <AuthLayout>
      <SignInSteps signIn={signIn} to={to} ticket={params.get("__clerk_ticket")} pendingMfa={pendingMfa} />
    </AuthLayout>
  );
}

function SignInSteps({ signIn, to, ticket, pendingMfa }: { signIn: SignIn; to: string; ticket: string | null; pendingMfa: boolean }) {
  const completeSession = useCompleteSession();
  const resuming = signIn.status === "needs_second_factor";
  const [step, setStep] = useState<Step>(() =>
    pendingMfa
      ? { name: "setup-mfa" }
      : ticket || resuming
        ? { name: "working", label: "Signing you in…" }
        : { name: "email" },
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState(() => (ticket || resuming ? "" : googleError(signIn)));
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const resumed = useRef(false);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  function go(next: Step) {
    setError("");
    setCode("");
    setStep(next);
  }

  function startOver() {
    setPassword("");
    go({ name: "email" });
  }

  /** Runs a Clerk call with the busy state and plain-language errors. */
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function advance(res: SignIn) {
    if (res.status === "complete") {
      if ((await completeSession(res.createdSessionId, to)) === "setup-mfa") go({ name: "setup-mfa" });
      return;
    }
    if (res.status === "needs_second_factor") {
      const factors = res.supportedSecondFactors ?? [];
      if (factors.some((f) => f.strategy === "totp")) return go({ name: "second-factor", strategy: "totp" });
      const emailFactor = factors.find((f) => f.strategy === "email_code");
      if (emailFactor?.strategy === "email_code") {
        await res.prepareSecondFactor({ strategy: "email_code", emailAddressId: emailFactor.emailAddressId });
        setResendIn(RESEND_SECONDS);
        return go({ name: "second-factor", strategy: "email_code", sentTo: emailFactor.safeIdentifier });
      }
      throw new Error(`Your account uses a second step this portal doesn't support. Email CBES at ${CBES_EMAIL}.`);
    }
    if (res.status === "needs_new_password") return go({ name: "new-password" });
    if (res.status === "needs_first_factor") return go({ name: "password" });
    throw new Error("Sign-in didn't finish. Start again.");
  }

  // Arriving from an invitation link, or back from Google with a second step still to do.
  useEffect(() => {
    if (resumed.current || pendingMfa || !(ticket || resuming)) return;
    resumed.current = true;
    const arrival = ticket ? signIn.create({ strategy: "ticket", ticket }) : Promise.resolve(signIn);
    arrival.then(advance).catch((err: unknown) => {
      setStep({ name: "email" });
      setError(authErrorMessage(err));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on arrival
  }, []);

  // Passkeys saved in the browser are offered right in the email field's autofill.
  useEffect(() => {
    if (step.name !== "email") return;
    let cancelled = false;
    void window.PublicKeyCredential?.isConditionalMediationAvailable?.().then((ok) => {
      if (!ok || cancelled) return;
      signIn
        .authenticateWithPasskey({ flow: "autofill" })
        .then(advance)
        .catch((err: unknown) => {
          // Dismissing the prompt or moving on to another step isn't an error worth showing.
          if (!cancelled && isClerkAPIResponseError(err)) setError(authErrorMessage(err));
        });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per visit to the email step
  }, [step.name]);

  const submitEmail = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const res = await signIn.create({ identifier: email.trim() });
      const factors = res.supportedFirstFactors ?? [];
      if (factors.some((f) => f.strategy === "password")) return go({ name: "password" });
      await sendEmailCode(res);
    });
  };

  async function sendEmailCode(res: SignIn = signIn) {
    const factor = res.supportedFirstFactors?.find((f) => f.strategy === "email_code");
    if (factor?.strategy !== "email_code") throw new Error("This account can't get sign-in codes by email. Use your password instead.");
    await res.prepareFirstFactor({ strategy: "email_code", emailAddressId: factor.emailAddressId });
    setResendIn(RESEND_SECONDS);
    go({ name: "email-code", emailAddressId: factor.emailAddressId });
  }

  async function sendResetCode() {
    await signIn.create({ strategy: "reset_password_email_code", identifier: email.trim() });
    setResendIn(RESEND_SECONDS);
    go({ name: "reset-code" });
  }

  const google = () =>
    run(() =>
      signIn.authenticateWithRedirect({
        strategy: "oauth_google",
        redirectUrl: "/portal/login/sso-callback",
        redirectUrlComplete: to,
      }),
    );

  const passkey = () => run(async () => advance(await signIn.authenticateWithPasskey({ flow: "discoverable" })));

  switch (step.name) {
    case "working":
      return (
        <>
          <StepHeading title="Sign in to the CBES portal" focus={false} />
          <Loading label={step.label} />
        </>
      );

    case "setup-mfa":
      return <SetupMfaStep to={to} />;

    case "email":
      return (
        <>
          <StepHeading title="Sign in to the CBES portal" focus={false}>
            For property managers, valets and the CBES team.
          </StepHeading>
          <div className="flex flex-col gap-5">
            {error && <Alert>{error}</Alert>}
            <Button variant="outline" onClick={google} disabled={busy}>
              <GoogleMark />
              Continue with Google
            </Button>
            <p className="m-0 flex items-center gap-3 text-sm text-muted before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">
              or use your email
            </p>
            <form onSubmit={submitEmail} className="flex flex-col gap-5">
              <TextField
                label="Email address"
                type="email"
                autoComplete="username webauthn"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Button type="submit" disabled={busy}>
                {busy ? "Checking…" : "Continue"}
              </Button>
            </form>
            <TextButton onClick={passkey} disabled={busy} className="self-start">
              Sign in with a passkey
            </TextButton>
          </div>
          <AccessNote />
        </>
      );

    case "password":
      return (
        <>
          <StepHeading title="Enter your password" />
          <SignedInAs email={email} onChange={startOver} />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => advance(await signIn.attemptFirstFactor({ strategy: "password", password })));
            }}
            className="flex flex-col gap-5"
          >
            {error && <Alert>{error}</Alert>}
            <PasswordField label="Password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <Button type="submit" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </form>
          <Alternatives>
            <TextButton onClick={() => run(() => sendResetCode())} disabled={busy}>
              Forgot your password?
            </TextButton>
            <TextButton onClick={() => run(() => sendEmailCode())} disabled={busy}>
              Email me a code instead
            </TextButton>
          </Alternatives>
        </>
      );

    case "email-code":
      return (
        <CodeStep
          title="Check your email"
          intro="Enter the 6-digit code we just emailed you."
          email={email}
          onStartOver={startOver}
          code={code}
          setCode={setCode}
          error={error}
          busy={busy}
          submitLabel="Verify code"
          onSubmit={() => run(async () => advance(await signIn.attemptFirstFactor({ strategy: "email_code", code })))}
          resendIn={resendIn}
          onResend={() => run(() => sendEmailCode())}
        />
      );

    case "second-factor":
      return step.strategy === "totp" ? (
        <CodeStep
          title="Two-step verification"
          intro="Enter the 6-digit code from your authenticator app."
          email={email}
          onStartOver={startOver}
          code={code}
          setCode={setCode}
          error={error}
          busy={busy}
          codeLabel="Code from the app"
          submitLabel="Verify code"
          onSubmit={() => run(async () => advance(await signIn.attemptSecondFactor({ strategy: "totp", code })))}
        />
      ) : (
        <CodeStep
          title="Confirm it's you"
          intro={`This is a new device for your account. Enter the code we sent to ${step.sentTo ?? "your email"}.`}
          email={email}
          onStartOver={startOver}
          code={code}
          setCode={setCode}
          error={error}
          busy={busy}
          submitLabel="Verify code"
          onSubmit={() => run(async () => advance(await signIn.attemptSecondFactor({ strategy: "email_code", code })))}
          resendIn={resendIn}
          onResend={() => run(() => advance(signIn))}
        />
      );

    case "reset-code":
      return (
        <CodeStep
          title="Reset your password"
          intro="Enter the 6-digit code we just emailed you, then choose a new password."
          email={email}
          onStartOver={startOver}
          code={code}
          setCode={setCode}
          error={error}
          busy={busy}
          submitLabel="Continue"
          onSubmit={() =>
            run(async () => advance(await signIn.attemptFirstFactor({ strategy: "reset_password_email_code", code })))
          }
          resendIn={resendIn}
          onResend={() => run(() => sendResetCode())}
        />
      );

    case "new-password":
      return (
        <>
          <StepHeading title="Choose a new password" />
          <SignedInAs email={email} onChange={startOver} />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => advance(await signIn.resetPassword({ password, signOutOfOtherSessions: true })));
            }}
            className="flex flex-col gap-5"
          >
            {error && <Alert>{error}</Alert>}
            <PasswordField
              label="New password"
              autoComplete="new-password"
              minLength={10}
              hint="At least 10 characters. A short phrase works well. You'll be signed out on other devices."
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save password and sign in"}
            </Button>
          </form>
        </>
      );
  }
}

function CodeStep(props: {
  title: string;
  intro: string;
  email: string;
  onStartOver: () => void;
  code: string;
  setCode: (code: string) => void;
  error: string;
  busy: boolean;
  codeLabel?: string;
  codeAutoComplete?: string;
  submitLabel: string;
  onSubmit: () => void;
  resendIn?: number;
  onResend?: () => void;
}) {
  return (
    <>
      <StepHeading title={props.title}>{props.intro}</StepHeading>
      {props.email && <SignedInAs email={props.email} onChange={props.onStartOver} />}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          props.onSubmit();
        }}
        className="flex flex-col gap-5"
      >
        {props.error && <Alert>{props.error}</Alert>}
        <CodeField
          label={props.codeLabel}
          autoComplete={props.codeAutoComplete}
          value={props.code}
          onChange={(e) => props.setCode(e.target.value.replace(/\D/g, ""))}
        />
        <Button type="submit" disabled={props.busy}>
          {props.busy ? "Checking…" : props.submitLabel}
        </Button>
      </form>
      {props.onResend && (
        <Alternatives>
          <TextButton onClick={props.onResend} disabled={props.busy || (props.resendIn ?? 0) > 0}>
            {props.resendIn ? `Send a new code in ${props.resendIn}s` : "Send a new code"}
          </TextButton>
        </Alternatives>
      )}
    </>
  );
}

/** A Google account with no CBES account comes back from the redirect with this error. */
function googleError(signIn: SignIn): string {
  const verification = signIn.firstFactorVerification;
  if (!verification?.strategy?.startsWith("oauth_")) return "";
  if (verification.error) return apiErrorMessage(verification.error);
  return verification.status === "transferable" ? apiErrorMessage({ code: "external_account_not_found" }) : "";
}

function Alternatives({ children }: { children: ReactNode }) {
  return <div className="mt-4 flex flex-wrap gap-x-6">{children}</div>;
}

function AccessNote() {
  return <p className="mt-7 mb-0 border-t border-line pt-5 text-sm leading-relaxed text-muted">{ACCESS_NOTE}</p>;
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" className="size-5">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
