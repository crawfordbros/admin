import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startRegistration } from "@simplewebauthn/browser";
import { clerkError, fakeClerk, fakeSession } from "../../test/clerk";
import { mockFetch, renderRoute } from "../../test/render";
import { AccountSettings } from "./AccountSettings";

vi.mock("@simplewebauthn/browser", () => ({ startRegistration: vi.fn() }));

const g = globalThis as { __clerkUser?: unknown };
const STRONG = "New-passw0rd!";

function device(id: string, activity: Record<string, unknown>, minutesAgo = 0) {
  return { id, status: "active", lastActiveAt: new Date(Date.now() - minutesAgo * 60_000), latestActivity: activity, revoke: vi.fn(async () => ({})) };
}

function setup({ passkeys = [] as unknown[], authenticator = false, user = {} as Record<string, unknown> } = {}) {
  const clerk = fakeClerk();
  clerk.session = fakeSession();
  const sessions = [
    device("sess_1", { browserName: "Chrome", deviceType: "Macintosh", city: "Boston", country: "US" }),
    device("sess_2", { browserName: "Safari", deviceType: "iPhone", isMobile: true }, 90),
    device("sess_3", { browserName: "Edge", deviceType: "Windows" }, 5),
  ];
  const account = {
    id: "user_1",
    fullName: null,
    primaryEmailAddress: { emailAddress: "rep@example.com" },
    publicMetadata: { role: "representative" },
    passwordEnabled: true,
    totpEnabled: authenticator,
    externalAccounts: [],
    updatePassword: vi.fn(async () => account),
    getSessions: vi.fn(async () => sessions),
    ...user,
  };
  g.__clerkUser = account;
  let list = { authenticator, passkeys };
  const calls = mockFetch((url, method) => {
    if (url.endsWith("/auth/mfa/passkeys") && method === "GET") return [200, list];
    if (method === "DELETE") {
      list = { ...list, passkeys: list.passkeys.filter((p) => !url.endsWith(`/${(p as { id: string }).id}`)) };
      return [204, null];
    }
    if (url.endsWith("/register/options")) return [200, { options: {}, challengeId: "ch_1" }];
    if (url.endsWith("/register/verify")) {
      list = { ...list, passkeys: [...list.passkeys, { id: "pk_new", transports: ["hybrid"], createdAt: "2026-10-28T12:00:00Z", current: true }] };
      return [200, { verified: true }];
    }
    return [200, {}];
  });
  renderRoute("/portal/settings", "/portal/settings", <AccountSettings />);
  return { clerk, account, sessions, calls };
}

beforeEach(() => {
  vi.stubGlobal("isSecureContext", true);
  vi.stubGlobal("PublicKeyCredential", class {});
  vi.mocked(startRegistration).mockReset();
});
afterEach(() => {
  g.__clerkUser = undefined;
});

describe("identity", () => {
  it("shows the email, role and how the account signs in, with a way to sign out", async () => {
    setup({ user: { externalAccounts: [{ provider: "google" }] } });
    const card = screen.getByRole("complementary", { name: "Signed in as" });
    expect(card).toHaveTextContent("rep@example.com");
    expect(card).toHaveTextContent("Rep");
    expect(card).toHaveTextContent("Password or Google");
    expect(within(card).getByRole("button", { name: "Sign out" })).toBeEnabled();
  });
});

describe("password", () => {
  it("checks the new password before sending it to Clerk", async () => {
    const { account } = setup();
    await userEvent.type(screen.getByLabelText("Current password"), "old-password");
    await userEvent.type(screen.getByLabelText("New password"), "short");
    await userEvent.type(screen.getByLabelText("Confirm new password"), "shorter");
    await userEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(screen.getByText("Use at least 10 characters.")).toBeVisible();
    expect(screen.getByText("The passwords don't match.")).toBeVisible();
    expect(account.updatePassword).not.toHaveBeenCalled();
  });

  it("changes the password and signs out other devices by default", async () => {
    const { account } = setup();
    await userEvent.type(screen.getByLabelText("Current password"), "Old-passw0rd!");
    await userEvent.type(screen.getByLabelText("New password"), STRONG);
    await userEvent.type(screen.getByLabelText("Confirm new password"), STRONG);
    await userEvent.click(screen.getByRole("button", { name: "Change password" }));
    await waitFor(() => expect(account.updatePassword).toHaveBeenCalledWith({ newPassword: STRONG, currentPassword: "Old-passw0rd!", signOutOfOtherSessions: true }));
    expect(await screen.findByText("Password changed")).toBeVisible();
    expect(screen.getByLabelText("Current password")).toHaveValue("");
  });

  it("explains a wrong current password", async () => {
    const { account } = setup();
    account.updatePassword.mockRejectedValueOnce(clerkError("form_password_incorrect"));
    await userEvent.type(screen.getByLabelText("Current password"), "wrong");
    await userEvent.type(screen.getByLabelText("New password"), STRONG);
    await userEvent.type(screen.getByLabelText("Confirm new password"), STRONG);
    await userEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Your current password isn't right.");
  });

  it("answers Clerk's re-confirmation with the current password and an authenticator code, without Clerk's modal", async () => {
    const { clerk, account } = setup({ authenticator: true });
    const verify = {
      startVerification: vi.fn(async () => ({ status: "needs_first_factor" })),
      attemptFirstFactorVerification: vi.fn(async () => ({ status: "needs_second_factor" })),
      attemptSecondFactorVerification: vi.fn(async () => ({ status: "complete" })),
    };
    Object.assign(clerk.session!, verify);
    account.updatePassword
      .mockRejectedValueOnce(clerkError("session_reverification_required"))
      .mockRejectedValueOnce(clerkError("session_reverification_required"));
    await userEvent.type(screen.getByLabelText("Current password"), "Old-passw0rd!");
    await userEvent.type(screen.getByLabelText("New password"), STRONG);
    await userEvent.type(screen.getByLabelText("Confirm new password"), STRONG);
    await userEvent.click(screen.getByRole("button", { name: "Change password" }));

    const code = await screen.findByLabelText("Authenticator code");
    expect(verify.startVerification).toHaveBeenCalledWith({ level: "multi_factor" });
    expect(verify.attemptFirstFactorVerification).toHaveBeenCalledWith({ strategy: "password", password: "Old-passw0rd!" });
    await userEvent.type(code, "123456");
    await userEvent.click(screen.getByRole("button", { name: "Change password" }));
    await waitFor(() => expect(verify.attemptSecondFactorVerification).toHaveBeenCalledWith({ strategy: "totp", code: "123456" }));
    await waitFor(() => expect(account.updatePassword).toHaveBeenCalledTimes(3));
    expect(await screen.findByText("Password changed")).toBeVisible();
  });

  it("lets a Google-only account add a password without a current one", async () => {
    const { account } = setup({ user: { passwordEnabled: false, externalAccounts: [{ provider: "google" }] } });
    expect(screen.queryByLabelText("Current password")).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("New password"), STRONG);
    await userEvent.type(screen.getByLabelText("Confirm new password"), STRONG);
    await userEvent.click(screen.getByRole("button", { name: "Add password" }));
    await waitFor(() => expect(account.updatePassword).toHaveBeenCalledWith({ newPassword: STRONG, signOutOfOtherSessions: true }));
  });
});

describe("two-step verification", () => {
  const passkeys = [
    { id: "pk_1", transports: ["internal"], createdAt: "2026-10-01T12:00:00Z", current: true },
    { id: "pk_2", transports: ["usb"], createdAt: "2026-10-12T12:00:00Z", current: false },
  ];

  it("lists passkeys and keeps the one used for this sign-in", async () => {
    setup({ passkeys });
    expect(await screen.findByText("Saved on a device")).toBeVisible();
    expect(screen.getByText("Security key")).toBeVisible();
    expect(screen.getByText("Used for this sign-in")).toBeVisible();
    expect(screen.getAllByRole("button", { name: /^Remove passkey/ })).toHaveLength(1);
  });

  it("asks before removing a passkey, then removes it", async () => {
    const { calls } = setup({ passkeys });
    await userEvent.click(await screen.findByRole("button", { name: "Remove passkey added Oct 12, 2026" }));
    const confirm = screen.getByRole("group", { name: "Confirm removal" });
    await userEvent.click(within(confirm).getByRole("button", { name: "Keep it" }));
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "Remove passkey added Oct 12, 2026" }));
    await userEvent.click(within(screen.getByRole("group", { name: "Confirm removal" })).getByRole("button", { name: "Remove passkey" }));
    await waitFor(() => expect(calls.find((c) => c.method === "DELETE")?.url).toMatch(/\/auth\/mfa\/passkeys\/pk_2$/));
    await waitFor(() => expect(screen.queryByText("Security key")).not.toBeInTheDocument());
    expect(screen.getByText("Passkey removed")).toBeVisible();
  });

  it("adds another passkey with the device prompt", async () => {
    vi.mocked(startRegistration).mockResolvedValue({ id: "pk_new" } as never);
    const { calls } = setup({ passkeys: passkeys.slice(0, 1) });
    expect(await screen.findByText(/This is your only passkey/)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Add a passkey" }));
    expect(await screen.findByText("Saved on a phone")).toBeVisible();
    expect(calls.find((c) => c.url.endsWith("/register/verify"))?.body).toEqual({ challengeId: "ch_1", credential: { id: "pk_new" } });
    expect(screen.queryByText(/This is your only passkey/)).not.toBeInTheDocument();
  });

  it("shows an authenticator app account without passkey controls", async () => {
    setup({ authenticator: true });
    expect(await screen.findByText("Authenticator app")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Add a passkey" })).not.toBeInTheDocument();
    expect(screen.getByText(/ask CBES to reset it/)).toBeVisible();
  });
});

describe("signed-in devices", () => {
  it("lists this device first and signs out another one", async () => {
    const { sessions } = setup();
    const rows = await screen.findAllByText(/ on /, { selector: "p" });
    expect(rows.map((r) => r.textContent)).toEqual(["Chrome on Macintosh", "Edge on Windows", "Safari on iPhone"]);
    expect(screen.getByText("This device")).toBeVisible();
    expect(screen.getByText("Active now in Boston, US")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Sign out of Safari on iPhone" }));
    await waitFor(() => expect(sessions[1].revoke).toHaveBeenCalled());
    expect(sessions[0].revoke).not.toHaveBeenCalled();
    expect(sessions[2].revoke).not.toHaveBeenCalled();
    expect(await screen.findByText("Signed out of that device")).toBeVisible();
  });

  it("signs out of every other device at once", async () => {
    const { sessions } = setup();
    await userEvent.click(await screen.findByRole("button", { name: "Sign out of all other devices" }));
    await waitFor(() => expect(sessions[1].revoke).toHaveBeenCalled());
    expect(sessions[2].revoke).toHaveBeenCalled();
    expect(sessions[0].revoke).not.toHaveBeenCalled();
  });
});
