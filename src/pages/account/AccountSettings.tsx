import { useState, type FormEvent, type ReactNode } from "react";
import { useClerk, useUser } from "@clerk/clerk-react";
import { isClerkAPIResponseError } from "@clerk/clerk-react/errors";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/browser";
import { useAccountIdentity, useSignOut } from "../../components/account/account";
import { Monogram } from "../../components/account/AccountMenu";
import { Pill, Skeleton } from "../../components/display";
import { Icon, type IconName } from "../../components/icons";
import { useToast } from "../../components/Toast";
import { Alert, Button, TextField } from "../../components/ui";
import { formatDate, timeAgo } from "../../lib/format";
import { authErrorMessage, CBES_EMAIL } from "../auth/clerkErrors";
import { CodeField } from "../auth/fields";
import { useSecurityApi } from "../auth/security";
import { SettingsSection } from "../settings/sections";

// The signed-in person's own account (replaces Clerk's profile modal). Admins see it as a tab of
// Settings, everyone else at /portal/settings. Names aren't collected, so there is no profile to edit.

export function AccountSettings() {
  return (
    <div className="flex flex-wrap items-start gap-6">
      <IdentityCard />
      <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-5">
        <PasswordSection />
        <TwoStepSection />
        <DevicesSection />
      </div>
    </div>
  );
}

function IdentityCard() {
  const { user } = useUser();
  const { name, email, roleLabel, initial } = useAccountIdentity();
  const signOut = useSignOut();
  const google = user?.externalAccounts?.some((a) => a.provider === "google");
  const methods = [user?.passwordEnabled && "Password", google && "Google"].filter(Boolean).join(" or ");

  return (
    <aside aria-label="Signed in as" className="max-w-full flex-[1_1_240px] overflow-hidden rounded-[14px] border border-line bg-white lg:sticky lg:top-[88px]">
      <div className="flex flex-col items-start gap-3 bg-navy-ink px-5 pt-5 pb-4 text-white">
        <Monogram initial={initial} size={56} ring />
        <div className="min-w-0 max-w-full">
          <p className="m-0 text-[16px] font-bold [overflow-wrap:anywhere]">
            <BreakableEmail text={name} />
          </p>
          {roleLabel && <p className="m-0 mt-0.5 text-[13px] font-semibold text-gold-light">{roleLabel}</p>}
        </div>
      </div>
      <dl className="m-0 grid gap-3 px-5 py-4 text-[13.5px]">
        {email !== name && <Detail term="Email"><BreakableEmail text={email} /></Detail>}
        {methods && <Detail term="Signs in with">{methods}</Detail>}
      </dl>
      <p className="m-0 border-t border-row-line px-5 py-3.5 text-[13px] leading-relaxed text-muted">
        To change your email, write to <a href={`mailto:${CBES_EMAIL}`}>{CBES_EMAIL}</a>.
      </p>
      <div className="border-t border-row-line px-5 py-4">
        <Button variant="outline" className="w-full" onClick={signOut}>
          Sign out
        </Button>
      </div>
    </aside>
  );
}

/** Long addresses wrap after the @ rather than mid-word. */
function BreakableEmail({ text }: { text: string }) {
  const at = text.indexOf("@");
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at + 1)}
      <wbr />
      {text.slice(at + 1)}
    </>
  );
}

function Detail({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-muted">{term}</dt>
      <dd className="m-0 font-semibold text-ink [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

// ---- Password

/** Clerk's rules for this instance (Configure → Password). */
const PASSWORD_RULES = "At least 10 characters, with an uppercase and a lowercase letter, a number and a symbol.";

function passwordProblem(password: string): string | null {
  if (password.length < 10) return "Use at least 10 characters.";
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password)) return "Include an uppercase and a lowercase letter.";
  if (!/\d/.test(password)) return "Include a number.";
  if (!/[^A-Za-z0-9]/.test(password)) return "Include a symbol, such as ! or #.";
  return null;
}

const PASSWORD_MESSAGES: Record<string, string> = {
  form_password_incorrect: "Your current password isn't right. Try again.",
  form_password_pwned: "This password has appeared in a data breach elsewhere. Choose a different one.",
  form_password_size_in_bytes_exceeded: "That password is too long. Choose a shorter one.",
};

function passwordError(err: unknown): string {
  const code = isClerkAPIResponseError(err) ? err.errors[0]?.code : undefined;
  return (code && PASSWORD_MESSAGES[code]) || authErrorMessage(err);
}

const needsReverification = (err: unknown) => isClerkAPIResponseError(err) && err.errors.some((e) => e.code === "session_reverification_required");

function PasswordSection() {
  const { user } = useUser();
  const clerk = useClerk();
  const toast = useToast();
  const hasPassword = Boolean(user?.passwordEnabled);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [others, setOthers] = useState(true);
  const [shown, setShown] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ next?: string; confirm?: string }>({});
  const [form, setForm] = useState(0);

  const reset = () => {
    setCurrent("");
    setNext("");
    setConfirm("");
    setCode(null);
    setForm((f) => f + 1);
  };

  // Clerk can ask the session to confirm who it is before a password change. The current password
  // answers the first step; an authenticator code the second, when the account has one.
  const reverify = async () => {
    const session = clerk.session;
    if (!session) throw new Error("Sign in again to change your password.");
    let check = await session.startVerification({ level: user?.totpEnabled ? "multi_factor" : "first_factor" });
    if (check.status === "needs_first_factor") {
      if (!hasPassword) throw new Error("Sign out and sign in again, then add your password within 10 minutes.");
      check = await session.attemptFirstFactorVerification({ strategy: "password", password: current });
    }
    if (check.status === "needs_second_factor") {
      if (code === null) {
        setCode("");
        return false;
      }
      check = await session.attemptSecondFactorVerification({ strategy: "totp", code });
    }
    return check.status === "complete";
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const problems = { next: passwordProblem(next) ?? undefined, confirm: confirm && confirm !== next ? "The passwords don't match." : undefined };
    if (!confirm) problems.confirm = "Enter the new password again.";
    setFieldErrors(problems);
    setError(null);
    if (problems.next || problems.confirm) return;
    const change = () => user.updatePassword({ newPassword: next, ...(hasPassword ? { currentPassword: current } : {}), signOutOfOtherSessions: others });
    try {
      try {
        await change();
      } catch (err) {
        if (!needsReverification(err)) throw err;
        if (!(await reverify())) return;
        await change();
      }
      reset();
      toast.success(hasPassword ? "Password changed" : "Password added");
    } catch (err) {
      setError(passwordError(err));
    }
  };

  return (
    <SettingsSection
      id="password"
      title="Password"
      description={hasPassword ? "Use it with your email to sign in." : "You sign in with Google. Add a password to also sign in with your email."}
    >
      <form key={form} onSubmit={submit} noValidate className="grid max-w-md gap-4">
        {error && <Alert>{error}</Alert>}
        {hasPassword && <TextField label="Current password" type={shown ? "text" : "password"} autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />}
        <TextField label="New password" type={shown ? "text" : "password"} autoComplete="new-password" hint={PASSWORD_RULES} error={fieldErrors.next} value={next} onChange={(e) => setNext(e.target.value)} />
        <TextField label="Confirm new password" type={shown ? "text" : "password"} autoComplete="new-password" error={fieldErrors.confirm} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <label className="-mt-1 inline-flex w-fit cursor-pointer items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={shown} onChange={(e) => setShown(e.target.checked)} className="size-4 accent-navy" />
          Show passwords
        </label>
        {code !== null && (
          <div className="grid gap-2 rounded-xl bg-subtle p-4">
            <p className="m-0 text-[14px] font-semibold">Confirm it's you with the 6-digit code from your authenticator app.</p>
            <CodeField label="Authenticator code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoFocus />
          </div>
        )}
        <label className="flex cursor-pointer items-start gap-2.5 text-[14px]">
          <input type="checkbox" checked={others} onChange={(e) => setOthers(e.target.checked)} className="mt-0.5 size-4 flex-none accent-navy" />
          <span>
            Sign out of my other devices
            <span className="block text-[13px] text-muted">Recommended if you think someone else knows your old password.</span>
          </span>
        </label>
        <Button type="submit" className="justify-self-start" disabled={(hasPassword && !current) || !next || (code !== null && code.length !== 6)}>
          {hasPassword ? "Change password" : "Add password"}
        </Button>
      </form>
    </SettingsSection>
  );
}

// ---- Two-step verification

type Passkey = { id: string; transports: string[]; createdAt: string; current: boolean };
type PasskeyList = { authenticator: boolean; passkeys: Passkey[] };

/** What kind of passkey it is, from the transports the browser reported when it was created. */
function passkeyKind(transports: string[]): { label: string; icon: IconName } {
  if (transports.includes("internal")) return { label: "Saved on a device", icon: "lock" };
  if (transports.includes("hybrid")) return { label: "Saved on a phone", icon: "smartphone" };
  if (transports.some((t) => t === "usb" || t === "nfc" || t === "ble")) return { label: "Security key", icon: "shield" };
  return { label: "Passkey", icon: "lock" };
}

const cancelled = (err: unknown) => err && typeof err === "object" && "name" in err && (err.name === "NotAllowedError" || err.name === "AbortError");

function TwoStepSection() {
  const api = useSecurityApi();
  const queryClient = useQueryClient();
  const toast = useToast();
  const clerk = useClerk();
  const key = ["account", "passkeys", clerk.session?.id];
  const list = useQuery({ queryKey: key, queryFn: () => api<PasskeyList>("/passkeys") });
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const canAdd = typeof window !== "undefined" && window.isSecureContext && typeof window.PublicKeyCredential === "function";

  const refresh = async () => {
    await Promise.all([queryClient.invalidateQueries({ queryKey: key }), queryClient.invalidateQueries({ queryKey: ["security"] })]);
  };

  const add = async () => {
    setError(null);
    try {
      const { startRegistration } = await import("@simplewebauthn/browser");
      const { options, challengeId } = await api<{ options: PublicKeyCredentialCreationOptionsJSON; challengeId: string }>("/passkeys/register/options", {});
      const credential = await startRegistration({ optionsJSON: options });
      await api("/passkeys/register/verify", { challengeId, credential });
      await refresh();
      toast.success("Passkey added");
    } catch (err) {
      setError(cancelled(err) ? "The passkey prompt was cancelled or timed out. Try again when you're ready." : authErrorMessage(err));
    }
  };

  const remove = async (id: string) => {
    setError(null);
    try {
      await api(`/passkeys/${encodeURIComponent(id)}`, undefined, "DELETE");
      setConfirming(null);
      await refresh();
      toast.success("Passkey removed");
    } catch (err) {
      setConfirming(null);
      setError(authErrorMessage(err));
    }
  };

  const data = list.data;
  const passkeys = data?.passkeys ?? [];
  return (
    <SettingsSection
      id="two-step"
      title="Two-step verification"
      description="After your password or Google, the portal asks for this to confirm it's you."
      action={
        passkeys.length > 0 && canAdd ? (
          <Button variant="outline" onClick={add}>
            <Icon name="plus" size={16} strokeWidth={2.4} />
            Add a passkey
          </Button>
        ) : undefined
      }
    >
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      {list.isError ? (
        <Alert>{authErrorMessage(list.error)}</Alert>
      ) : !data ? (
        <div role="status" aria-label="Loading" className="grid gap-2">
          <Skeleton className="h-16 rounded-xl" />
        </div>
      ) : (
        <ul className="m-0 grid list-none gap-2 p-0">
          {passkeys.map((p) => {
            const kind = passkeyKind(p.transports);
            return (
              <li key={p.id} className="rounded-xl border border-line">
                <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <MethodIcon name={kind.icon} />
                  <div className="min-w-0 flex-[1_1_200px]">
                    <p className="m-0 text-[14.5px] font-bold">{kind.label}</p>
                    <p className="m-0 text-[13px] text-muted">Added {formatDate(p.createdAt)}</p>
                  </div>
                  {p.current ? (
                    <Pill tone="success">Used for this sign-in</Pill>
                  ) : (
                    (passkeys.length > 1 || data.authenticator) &&
                    confirming !== p.id && (
                      <Button variant="outline" onClick={() => setConfirming(p.id)} aria-label={`Remove passkey added ${formatDate(p.createdAt)}`}>
                        Remove
                      </Button>
                    )
                  )}
                </div>
                {confirming === p.id && (
                  <div role="group" aria-label="Confirm removal" className="flex flex-wrap items-center gap-3 border-t border-row-line bg-danger-bg/60 px-4 py-3">
                    <p className="m-0 min-w-0 flex-[1_1_240px] text-[13.5px] font-semibold text-danger">You won't be able to sign in with this passkey again.</p>
                    <Button variant="outline" onClick={() => setConfirming(null)}>
                      Keep it
                    </Button>
                    <Button variant="danger" onClick={() => remove(p.id)}>
                      Remove passkey
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
          {data.authenticator && (
            <li className="flex flex-wrap items-center gap-3 rounded-xl border border-line px-4 py-3">
              <MethodIcon name="clock" />
              <div className="min-w-0 flex-[1_1_200px]">
                <p className="m-0 text-[14.5px] font-bold">Authenticator app</p>
                <p className="m-0 text-[13px] text-muted">A 6-digit code from an app such as Google Authenticator</p>
              </div>
              <Pill tone="success">On</Pill>
            </li>
          )}
        </ul>
      )}
      {data && (
        <p className="mt-4 mb-0 text-[13px] leading-relaxed text-muted">
          {passkeys.length === 1 && !data.authenticator
            ? "This is your only passkey. Add another, such as one on your phone, so you can still sign in if you lose this device. "
            : ""}
          To switch to a different kind of verification, ask CBES to reset it at <a href={`mailto:${CBES_EMAIL}`}>{CBES_EMAIL}</a>.
        </p>
      )}
    </SettingsSection>
  );
}

function MethodIcon({ name }: { name: IconName }) {
  return (
    <span aria-hidden="true" className="flex size-10 flex-none items-center justify-center rounded-[10px] bg-tint-2 text-navy">
      <Icon name={name} size={20} strokeWidth={2} />
    </span>
  );
}

// ---- Signed-in devices

function deviceName(a: { browserName?: string; deviceType?: string; isMobile?: boolean } | undefined) {
  const browser = a?.browserName || "A browser";
  const device = a?.deviceType || (a?.isMobile ? "a phone" : "a computer");
  return `${browser} on ${device}`;
}

function DevicesSection() {
  const { user } = useUser();
  const clerk = useClerk();
  const toast = useToast();
  const currentId = clerk.session?.id;
  const sessions = useQuery({
    queryKey: ["account", "sessions", user?.id],
    queryFn: async () => (await user!.getSessions()).filter((s) => s.status === "active"),
    enabled: Boolean(user),
  });
  const [error, setError] = useState<string | null>(null);
  const list = [...(sessions.data ?? [])].sort((a, b) => Number(b.id === currentId) - Number(a.id === currentId) || +b.lastActiveAt - +a.lastActiveAt);
  const others = list.filter((s) => s.id !== currentId);

  const revoke = async (targets: typeof list) => {
    setError(null);
    try {
      await Promise.all(targets.map((s) => s.revoke()));
      await sessions.refetch();
      toast.success(targets.length === 1 ? "Signed out of that device" : "Signed out of your other devices");
    } catch (err) {
      setError(authErrorMessage(err));
    }
  };

  return (
    <SettingsSection
      id="devices"
      title="Signed-in devices"
      description="Where your account is signed in right now. Sign out of anything you don't recognize."
      action={
        others.length > 1 ? (
          <Button variant="outline" onClick={() => revoke(others)}>
            Sign out of all other devices
          </Button>
        ) : undefined
      }
    >
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      {sessions.isError ? (
        <Alert>{authErrorMessage(sessions.error)}</Alert>
      ) : !sessions.data ? (
        <div role="status" aria-label="Loading" className="grid gap-2">
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
        </div>
      ) : (
        <ul className="m-0 grid list-none gap-2 p-0">
          {list.map((s) => {
            const a = s.latestActivity;
            const place = [a?.city, a?.country].filter(Boolean).join(", ");
            const here = s.id === currentId;
            return (
              <li key={s.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line px-4 py-3">
                <MethodIcon name={a?.isMobile ? "smartphone" : "monitor"} />
                <div className="min-w-0 flex-[1_1_200px]">
                  <p className="m-0 text-[14.5px] font-bold">{deviceName(a)}</p>
                  <p className="m-0 text-[13px] text-muted">
                    {here ? "Active now" : `Active ${timeAgo(s.lastActiveAt.toISOString())}`}
                    {place && ` in ${place}`}
                  </p>
                </div>
                {here ? (
                  <Pill tone="navy">This device</Pill>
                ) : (
                  <Button variant="outline" onClick={() => revoke([s])} aria-label={`Sign out of ${deviceName(a)}`}>
                    Sign out
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </SettingsSection>
  );
}
