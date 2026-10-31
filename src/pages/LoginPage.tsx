import { useEffect, useRef, useState, type ComponentType, type FormEvent, type ReactNode } from "react";
import { useAuth, useSignIn } from "@clerk/clerk-react";
import { Navigate, useLocation, useSearchParams } from "react-router-dom";
import { Alert, Button, Loading, TextField } from "../components/ui";
import { AuthLayout } from "./auth/AuthLayout";
import { apiErrorMessage, authErrorMessage } from "./auth/clerkErrors";
import { useAuthCopy, type AuthCopy } from "./auth/authCopy";
import { CodeField, PasswordField, SignedInAs, StepHeading, TextButton } from "./auth/fields";
import { afterSignInPath } from "./auth/redirect";
import { SetupMfaStep } from "./auth/SetupMfaStep";
import { useCompleteSession, usePendingMfaSetup } from "./auth/session";

type SignIn = NonNullable<ReturnType<typeof useSignIn>["signIn"]>;

type Step =
  | { name: "email" }
  | { name: "password" }
  | { name: "second-factor"; strategy: "totp" | "email_code"; sentTo?: string }
  | { name: "reset-code" }
  | { name: "new-password" }
  | { name: "setup-mfa" }
  | { name: "working"; label: string };

const RESEND_SECONDS = 30;

type LoginOptions = {
  /** Frames the steps: the portal's sign-in layout, or the Steward app's. */
  layout?: ComponentType<{ children: ReactNode }>;
  /** The first step's heading and the browser tab title. */
  title?: string;
  documentTitle?: string;
  /** Where the sign-in page lives (/portal or /steward): the Google return path and the default landing page. */
  home?: "/portal" | "/steward";
};

/** Staff and manager sign-in. Accounts are invite-only, so there is no way to sign up here. */
export function LoginPage({ layout: Layout = AuthLayout, title = "Sign in to the CBES portal", documentTitle = "Sign in | CBES Portal", home = "/portal" }: LoginOptions = {}) {
  const { isLoaded, signIn } = useSignIn();
  const { isSignedIn } = useAuth();
  const pendingMfa = usePendingMfaSetup();
  const { search } = useLocation();
  const [params] = useSearchParams();
  const to = afterSignInPath(search, undefined, home);

  useEffect(() => {
    document.title = documentTitle;
  }, [documentTitle]);

  if (!isLoaded) {
    return (
      <Layout>
        <Loading />
      </Layout>
    );
  }
  if (isSignedIn) return <Navigate to={to} replace />;

  return (
    <Layout>
      <SignInNotice reason={params.get("reason")} />
      <SignInSteps signIn={signIn} to={to} ticket={params.get("__clerk_ticket")} pendingMfa={pendingMfa} title={title} home={home} />
    </Layout>
  );
}

function SignInSteps({ signIn, to, ticket, pendingMfa, title, home }: { signIn: SignIn; to: string; ticket: string | null; pendingMfa: boolean; title: string; home: string }) {
  const completeSession = useCompleteSession();
  const copy = useAuthCopy();
  const resuming = signIn.status === "needs_second_factor";
  const [step, setStep] = useState<Step>(() =>
    pendingMfa
      ? { name: "setup-mfa" }
      : ticket || resuming
        ? { name: "working", label: copy.signingIn }
        : { name: "email" },
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState(() => (ticket || resuming ? "" : googleError(signIn, copy)));
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
      setError(authErrorMessage(err, copy));
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
      throw new Error(copy.unsupportedSecondStep);
    }
    if (res.status === "needs_new_password") return go({ name: "new-password" });
    if (res.status === "needs_first_factor") return go({ name: "password" });
    throw new Error(copy.didntFinish);
  }

  // Arriving from an invitation link, or back from Google with a second step still to do.
  useEffect(() => {
    if (resumed.current || pendingMfa || !(ticket || resuming)) return;
    resumed.current = true;
    const arrival = ticket ? signIn.create({ strategy: "ticket", ticket }) : Promise.resolve(signIn);
    arrival.then(advance).catch((err: unknown) => {
      setStep({ name: "email" });
      setError(authErrorMessage(err, copy));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on arrival
  }, []);

  const submitEmail = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const res = await signIn.create({ identifier: email.trim() });
      const factors = res.supportedFirstFactors ?? [];
      if (factors.some((f) => f.strategy === "password")) return go({ name: "password" });
      throw new Error(copy.noPassword);
    });
  };

  async function sendResetCode() {
    await signIn.create({ strategy: "reset_password_email_code", identifier: email.trim() });
    setResendIn(RESEND_SECONDS);
    go({ name: "reset-code" });
  }

  const google = () =>
    run(() =>
      signIn.authenticateWithRedirect({
        strategy: "oauth_google",
        redirectUrl: `${home}/login/sso-callback`,
        redirectUrlComplete: to,
      }),
    );

  switch (step.name) {
    case "working":
      return (
        <>
          <StepHeading title={title} focus={false} />
          <Loading label={step.label} />
        </>
      );

    case "setup-mfa":
      return <SetupMfaStep to={to} />;

    case "email":
      return (
        <>
          <StepHeading title={title} focus={false} />
          <div className="flex flex-col gap-5">
            {error && <Alert>{error}</Alert>}
            <Button variant="outline" onClick={google} disabled={busy}>
              <GoogleMark />
              {copy.continueWithGoogle}
            </Button>
            <p className="m-0 flex items-center gap-3 text-sm text-muted before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">
              {copy.orUseEmail}
            </p>
            <form onSubmit={submitEmail} className="flex flex-col gap-5">
              <TextField
                label={copy.emailLabel}
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Button type="submit" disabled={busy}>
                {busy ? copy.checking : copy.continue}
              </Button>
            </form>
          </div>
        </>
      );

    case "password":
      return (
        <>
          <StepHeading title={copy.enterPassword} />
          <SignedInAs email={email} onChange={startOver} />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => advance(await signIn.attemptFirstFactor({ strategy: "password", password })));
            }}
            className="flex flex-col gap-5"
          >
            {error && <Alert>{error}</Alert>}
            <PasswordField label={copy.passwordLabel} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <Button type="submit" disabled={busy}>
              {busy ? copy.signingInBusy : copy.signIn}
            </Button>
          </form>
          <Alternatives>
            <TextButton onClick={() => run(() => sendResetCode())} disabled={busy}>
              {copy.forgotPassword}
            </TextButton>
          </Alternatives>
        </>
      );

    case "second-factor":
      return step.strategy === "totp" ? (
        <CodeStep
          title={copy.twoStepTitle}
          intro={copy.totpIntro}
          email={email}
          onStartOver={startOver}
          code={code}
          setCode={setCode}
          error={error}
          busy={busy}
          codeLabel={copy.codeFromApp}
          submitLabel={copy.verifyCode}
          onSubmit={() => run(async () => advance(await signIn.attemptSecondFactor({ strategy: "totp", code })))}
        />
      ) : (
        <CodeStep
          title={copy.confirmTitle}
          intro={copy.emailCodeIntro(step.sentTo ?? copy.yourEmail)}
          email={email}
          onStartOver={startOver}
          code={code}
          setCode={setCode}
          error={error}
          busy={busy}
          submitLabel={copy.verifyCode}
          onSubmit={() => run(async () => advance(await signIn.attemptSecondFactor({ strategy: "email_code", code })))}
          resendIn={resendIn}
          onResend={() => run(() => advance(signIn))}
        />
      );

    case "reset-code":
      return (
        <CodeStep
          title={copy.resetTitle}
          intro={copy.resetIntro}
          email={email}
          onStartOver={startOver}
          code={code}
          setCode={setCode}
          error={error}
          busy={busy}
          submitLabel={copy.continue}
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
          <StepHeading title={copy.newPasswordTitle} />
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
              label={copy.newPasswordLabel}
              autoComplete="new-password"
              minLength={10}
              hint={copy.newPasswordHint}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button type="submit" disabled={busy}>
              {busy ? copy.saving : copy.savePassword}
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
  const copy = useAuthCopy();
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
          {props.busy ? copy.checking : props.submitLabel}
        </Button>
      </form>
      {props.onResend && (
        <Alternatives>
          <TextButton onClick={props.onResend} disabled={props.busy || (props.resendIn ?? 0) > 0}>
            {props.resendIn ? copy.resendIn(props.resendIn) : copy.resend}
          </TextButton>
        </Alternatives>
      )}
    </>
  );
}

/** A Google account with no CBES account comes back from the redirect with this error. */
function googleError(signIn: SignIn, copy: AuthCopy): string {
  const verification = signIn.firstFactorVerification;
  if (!verification?.strategy?.startsWith("oauth_")) return "";
  if (verification.error) return apiErrorMessage(verification.error, copy);
  return verification.status === "transferable" ? apiErrorMessage({ code: "external_account_not_found" }, copy) : "";
}

/** Why the sign-in page opened: inactivity, an expired session, or signing out. */
function SignInNotice({ reason }: { reason: string | null }) {
  const copy = useAuthCopy();
  const text = reason === "inactivity" ? copy.inactivity : reason === "expired" ? copy.expired : reason === "signout" ? copy.signedOut : null;
  return text ? <p role="status">{text}</p> : null;
}

function Alternatives({ children }: { children: ReactNode }) {
  return <div className="mt-4 flex flex-wrap gap-x-6">{children}</div>;
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
