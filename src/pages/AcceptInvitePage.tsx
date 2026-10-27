import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useAuth, useSignUp } from "@clerk/clerk-react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { Alert, Button, Loading } from "../components/ui";
import { AuthLayout } from "./auth/AuthLayout";
import { authErrorMessage, CBES_EMAIL } from "./auth/clerkErrors";
import { PasswordField, StepHeading } from "./auth/fields";
import { SetupMfaStep } from "./auth/SetupMfaStep";
import { useCompleteSession, usePendingMfaSetup } from "./auth/session";

type SignUp = NonNullable<ReturnType<typeof useSignUp>["signUp"]>;

/**
 * Where Clerk's invitation email lands (redirect_url on the invitation). Sign-up is restricted to
 * invitations in Clerk, so an account can only be created with the ticket from that email. People
 * who already have an account are sent to sign in, which redeems the same ticket.
 */
export function AcceptInvitePage() {
  const [params] = useSearchParams();
  const { isLoaded, signUp } = useSignUp();
  const { isSignedIn } = useAuth();
  const pendingMfa = usePendingMfaSetup();
  const ticket = params.get("__clerk_ticket");
  const status = params.get("__clerk_status");

  useEffect(() => {
    document.title = "Accept your invitation | CBES Portal";
  }, []);

  if (status === "sign_in") return <Navigate to={`/portal/login?${params}`} replace />;
  if (isSignedIn) return <Navigate to="/portal" replace />;

  return (
    <AuthLayout>
      {!isLoaded ? (
        <Loading />
      ) : pendingMfa ? (
        <SetupMfaStep to="/portal" />
      ) : status === "complete" ? (
        <NoInvitation title="This invitation has already been used">
          Your account is set up. Sign in with the email the invitation went to.
        </NoInvitation>
      ) : ticket ? (
        <CreateAccount signUp={signUp} ticket={ticket} />
      ) : (
        <NoInvitation title="Set up your CBES portal account">Use the link in your invitation email from CBES.</NoInvitation>
      )}
    </AuthLayout>
  );
}

function CreateAccount({ signUp, ticket }: { signUp: SignUp; ticket: string }) {
  const completeSession = useCompleteSession();
  const [email, setEmail] = useState<string | null>();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [invalid, setInvalid] = useState("");
  const [busy, setBusy] = useState(false);
  const [mfa, setMfa] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    signUp
      .create({ strategy: "ticket", ticket })
      .then((res) => setEmail(res.emailAddress))
      .catch((err: unknown) => setInvalid(authErrorMessage(err)));
  }, [signUp, ticket]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await signUp.update({ password });
      if (res.status !== "complete") {
        throw new Error(`Your account still needs: ${res.missingFields.join(", ") || "more details"}. Email CBES at ${CBES_EMAIL}.`);
      }
      if ((await completeSession(res.createdSessionId, "/portal")) === "setup-mfa") setMfa(true);
    } catch (err) {
      setError(authErrorMessage(err));
      setBusy(false);
    }
  }

  if (mfa) return <SetupMfaStep to="/portal" />;
  if (invalid) {
    return (
      <NoInvitation title="This invitation link didn't work">
        {invalid} Ask CBES to send you a new invitation, or email {CBES_EMAIL}.
      </NoInvitation>
    );
  }
  if (email === undefined) return <Loading label="Checking your invitation…" />;

  return (
    <>
      <StepHeading title="Set up your account" focus={false}>
        You're joining the CBES portal{email ? (
          <>
            {" "}
            as <strong className="break-all text-ink">{email}</strong>
          </>
        ) : null}
        . Choose a password, then add two-step verification.
      </StepHeading>
      <form onSubmit={submit} className="flex flex-col gap-5">
        {error && <Alert>{error}</Alert>}
        {email && <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />}
        <PasswordField
          label="Password"
          autoComplete="new-password"
          minLength={10}
          hint="At least 10 characters. A short phrase works well."
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button type="submit" disabled={busy}>
          {busy ? "Creating your account…" : "Create account"}
        </Button>
      </form>
      <p className="mt-6 mb-0 text-sm text-muted">
        Already set up? <Link to="/portal/login" className="font-semibold">Sign in</Link>
      </p>
    </>
  );
}

function NoInvitation({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <StepHeading title={title} focus={false}>
        {children}
      </StepHeading>
      <p className="m-0 text-[15px] text-muted">
        Already set up? <Link to="/portal/login" className="font-semibold">Sign in</Link>
      </p>
    </>
  );
}
