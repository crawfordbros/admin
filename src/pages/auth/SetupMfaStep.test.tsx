import { StrictMode } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { fakeClerk, fakeSession, fakeSignIn } from "../../test/clerk";
import { mockFetch } from "../../test/render";
import { RequireSecurity } from "../../components/RequireSecurity";
import { LoginPage } from "../LoginPage";
import { SetupMfaStep } from "./SetupMfaStep";
import type { SecurityStatus } from "./security";
import * as passkeyBrowser from "../../lib/passkeyBrowser";

vi.mock("@simplewebauthn/browser", () => ({ startRegistration: vi.fn(), startAuthentication: vi.fn() }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function Location() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

const destination = "/admin/reports?period=week";
function flow(initial = destination) {
  const queries = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = () => <StrictMode><QueryClientProvider client={queries}>
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/portal/login" element={<LoginPage />} />
        <Route path="/setup" element={<SetupMfaStep to={destination} />} />
        <Route path="*" element={<RequireSecurity><p>Protected content</p></RequireSecurity>} />
      </Routes>
      <Location />
    </MemoryRouter>
  </QueryClientProvider></StrictMode>;
  const view = render(tree());
  return { queries, unmount: view.unmount, rerender: () => view.rerender(tree()) };
}

function securityServer(initial: Partial<SecurityStatus> = {}) {
  const status: SecurityStatus = { passkey: true, authenticator: false, verified: false, pending: false, ...initial };
  let challenge = 0;
  const calls = mockFetch((url) => {
    if (url === "/api/auth/session") return [200, { serverTime: Date.now(), lastActivityAt: Date.now(), expiresAt: Date.now() + 30 * 60_000 }];
    if (url.endsWith("/options")) return [200, { options: {}, challengeId: `challenge-${++challenge}` }];
    if (url.endsWith("/verify") || url.endsWith("/authenticator/complete")) {
      status.verified = true;
      status.pending = false;
      return [200, { verified: true }];
    }
    return [200, { ...status }];
  });
  return { calls, status };
}

beforeEach(() => {
  vi.stubGlobal("isSecureContext", true);
  vi.stubGlobal("PublicKeyCredential", class {});
  vi.mocked(startRegistration).mockReset();
  vi.mocked(startAuthentication).mockReset().mockImplementation(() => new Promise(() => {}));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("passkey module recovery", () => {
  it.each([true, false])("requires a reload after a loading failure (saved passkey: %s)", async (passkey) => {
    const clerk = fakeClerk();
    clerk.session = fakeSession();
    const { calls } = securityServer({ passkey });
    const load = vi.spyOn(passkeyBrowser, "loadPasskeyBrowser").mockRejectedValueOnce(
      new passkeyBrowser.PasskeyModuleLoadError(new TypeError("Failed to fetch dynamically imported module: https://example.com/module.js")),
    );
    const view = flow();
    if (!passkey) await userEvent.click(await screen.findByRole("button", { name: "Create a passkey" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn’t load passkey verification. Reload the page to try again.");
    expect(screen.getByRole("alert")).not.toHaveTextContent(/https:|module\.js|TypeError/);
    expect(screen.getByRole("button", { name: "Reload page" })).toBeEnabled();
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual(["Reload page", "Sign out"]);
    view.rerender();
    await act(async () => { await view.queries.invalidateQueries({ queryKey: ["security"] }); });
    expect(load).toHaveBeenCalledTimes(1);
    expect(startAuthentication).not.toHaveBeenCalled();
    expect(startRegistration).not.toHaveBeenCalled();
    expect(calls.some((call) => call.url.endsWith("/options") || call.url.endsWith("/verify"))).toBe(false);
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
    expect(clerk.setActive).not.toHaveBeenCalled();
    expect(screen.getByTestId("location")).toHaveTextContent(destination);
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(clerk.signOut).toHaveBeenCalledWith({ redirectUrl: "/portal/login" });
  });

  it("reloads only when requested, without navigating or changing the session", async () => {
    const reload = vi.fn();
    vi.stubGlobal("window", Object.create(window, { location: { value: { reload } } }));
    const clerk = fakeClerk();
    clerk.session = fakeSession();
    const session = clerk.session;
    securityServer();
    vi.spyOn(passkeyBrowser, "loadPasskeyBrowser").mockRejectedValueOnce(new passkeyBrowser.PasskeyModuleLoadError(new TypeError("Load failed")));
    flow();
    const button = await screen.findByRole("button", { name: "Reload page" });
    expect(reload).not.toHaveBeenCalled();
    await userEvent.click(button);
    expect(reload).toHaveBeenCalledExactlyOnceWith();
    expect(screen.getByTestId("location")).toHaveTextContent(destination);
    expect(clerk.session).toBe(session);
    expect(clerk.signOut).not.toHaveBeenCalled();
    expect(clerk.setActive).not.toHaveBeenCalled();
  });
});

describe("saved MFA method", () => {
  it.each([destination, "/setup"])("offers sign-out instead of MFA for forbidden impersonation on %s", async (path) => {
    const clerk = fakeClerk();
    clerk.session = fakeSession();
    mockFetch(() => [403, { code: "impersonation_forbidden", error: "Only Super Admins can impersonate another account." }]);
    flow(path);
    expect(await screen.findByRole("alert")).toHaveTextContent("Only Super Admins");
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
    expect(startAuthentication).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(clerk.signOut).toHaveBeenCalledWith({ redirectUrl: "/portal/login" });
  });

  it("opens the passkey prompt after a successful password and returns to the requested page", async () => {
    fakeClerk();
    const signIn = fakeSignIn();
    signIn.create.mockResolvedValue({ ...signIn, supportedFirstFactors: [{ strategy: "password" }] });
    signIn.attemptFirstFactor.mockResolvedValue({ ...signIn, status: "complete", createdSessionId: "sess_1" });
    const { calls } = securityServer();
    const prompt = deferred<Awaited<ReturnType<typeof startAuthentication>>>();
    vi.mocked(startAuthentication).mockReturnValue(prompt.promise);
    flow(`/portal/login?redirect_url=${encodeURIComponent(destination)}`);
    await userEvent.type(screen.getByLabelText("Email address"), "admin@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await userEvent.type(await screen.findByLabelText("Password"), "correct password");
    expect(startAuthentication).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(startAuthentication).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Verify with passkey|Set up authenticator/ })).not.toBeInTheDocument();
    await act(async () => { prompt.resolve({ id: "pk_1" } as never); });
    expect(await screen.findByText("Protected content")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent(destination);
    expect(calls.find((call) => call.url.endsWith("/authenticate/verify"))?.body).toEqual({ challengeId: "challenge-1", credential: { id: "pk_1" } });
    expect(startRegistration).not.toHaveBeenCalled();
  });

  it("automatically verifies the session returned by Google", async () => {
    const clerk = fakeClerk();
    clerk.session = fakeSession({ user: { externalAccounts: [{ provider: "google" }] } });
    securityServer();
    vi.mocked(startAuthentication).mockResolvedValue({ id: "pk_1" } as never);
    flow();
    expect(await screen.findByText("Protected content")).toBeInTheDocument();
    expect(startAuthentication).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("location")).toHaveTextContent(destination);
  });

  it("opens the authenticator code form directly without enrolling it again", async () => {
    const user = { createTOTP: vi.fn(), verifyTOTP: vi.fn() };
    const clerk = fakeClerk({ user });
    clerk.session = fakeSession({ user });
    const session = clerk.session;
    session.factorVerificationAge = [0, -1];
    securityServer({ passkey: false, authenticator: true });
    flow();
    await userEvent.type(await screen.findByLabelText("Code from the app"), "123456");
    expect(screen.queryByRole("button", { name: /Use authenticator|Back to security methods|Create a passkey/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Verify code and continue" }));
    expect(await screen.findByText("Protected content")).toBeInTheDocument();
    expect(session.attemptSecondFactorVerification).toHaveBeenCalledWith({ strategy: "totp", code: "123456" });
    expect(user.createTOTP).not.toHaveBeenCalled();
    expect(user.verifyTOTP).not.toHaveBeenCalled();
    expect(startAuthentication).not.toHaveBeenCalled();
  });

  it.each([destination, "/setup"])("does not repeat completed MFA on %s", async (path) => {
    const clerk = fakeClerk();
    clerk.session = fakeSession();
    securityServer({ passkey: true, authenticator: true, verified: true });
    flow(path);
    expect(await screen.findByText("Protected content")).toBeInTheDocument();
    expect(startAuthentication).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Code from the app")).not.toBeInTheDocument();
  });

  it("finishes an in-flight authenticator submission when a refresh reports verification", async () => {
    const clerk = fakeClerk({ user: {} });
    clerk.session = fakeSession({ user: {} });
    const session = clerk.session;
    session.factorVerificationAge = [0, -1];
    const verification = deferred<{ status: string }>();
    session.attemptSecondFactorVerification.mockReturnValueOnce(verification.promise);
    const { status } = securityServer({ passkey: false, authenticator: true });
    const view = flow("/setup");
    await userEvent.type(await screen.findByLabelText("Code from the app"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Verify code and continue" }));
    await waitFor(() => expect(session.attemptSecondFactorVerification).toHaveBeenCalledTimes(1));
    await act(async () => {
      status.verified = true;
      await view.queries.invalidateQueries({ queryKey: ["security"] });
    });
    expect(screen.getByRole("button", { name: "Verifying…" })).toBeDisabled();
    await act(async () => { verification.resolve({ status: "complete" }); });
    expect(await screen.findByText("Protected content")).toBeInTheDocument();
    expect(clerk.setActive).toHaveBeenCalledTimes(1);
  });

  it("starts with the passkey for a legacy account with both methods", async () => {
    const clerk = fakeClerk();
    clerk.session = fakeSession();
    securityServer({ authenticator: true });
    flow();
    await waitFor(() => expect(startAuthentication).toHaveBeenCalledTimes(1));
    expect(screen.queryByLabelText("Code from the app")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /authenticator app/ })).not.toBeInTheDocument();
  });

  it("does not duplicate the pending prompt across Strict Mode, rerenders, or refetches", async () => {
    const clerk = fakeClerk();
    clerk.session = fakeSession();
    const { calls } = securityServer();
    const view = flow();
    await waitFor(() => expect(startAuthentication).toHaveBeenCalledTimes(1));
    view.rerender();
    await act(async () => { await view.queries.invalidateQueries({ queryKey: ["security"] }); });
    expect(startAuthentication).toHaveBeenCalledTimes(1);
    expect(calls.filter((call) => call.url.endsWith("/authenticate/options"))).toHaveLength(1);
  });

  it("waits for an explicit retry after cancellation and gets a fresh challenge", async () => {
    const clerk = fakeClerk();
    clerk.session = fakeSession();
    const { calls } = securityServer();
    vi.mocked(startAuthentication).mockRejectedValueOnce(new DOMException("Cancelled", "NotAllowedError"));
    const view = flow();
    expect(await screen.findByRole("alert")).toHaveTextContent("cancelled or timed out");
    await act(async () => { await view.queries.invalidateQueries({ queryKey: ["security"] }); });
    expect(startAuthentication).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
    vi.mocked(startAuthentication).mockResolvedValueOnce({ id: "pk_1" } as never);
    await userEvent.click(screen.getByRole("button", { name: "Try passkey again" }));
    expect(await screen.findByText("Protected content")).toBeInTheDocument();
    expect(startAuthentication).toHaveBeenCalledTimes(2);
    expect(calls.find((call) => call.url.endsWith("/authenticate/verify"))?.body).toMatchObject({ challengeId: "challenge-2" });
  });

  it("does not let an older status request undo successful verification", async () => {
    const clerk = fakeClerk();
    clerk.session = fakeSession();
    securityServer();
    const prompt = deferred<Awaited<ReturnType<typeof startAuthentication>>>();
    vi.mocked(startAuthentication).mockReturnValueOnce(prompt.promise);
    const view = flow();
    await waitFor(() => expect(startAuthentication).toHaveBeenCalledTimes(1));
    const oldStatus = deferred<Response>();
    const fetch = globalThis.fetch;
    let holdNextStatus = true;
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (holdNextStatus && String(input).endsWith("/mfa/status")) {
        holdNextStatus = false;
        return oldStatus.promise;
      }
      return fetch(input, init);
    }));
    let refetch!: Promise<void>;
    await act(async () => { refetch = view.queries.invalidateQueries({ queryKey: ["security"] }); });
    await waitFor(() => expect(holdNextStatus).toBe(false));
    await act(async () => { prompt.resolve({ id: "pk_1" } as never); });
    expect(await screen.findByText("Protected content")).toBeInTheDocument();
    await act(async () => {
      oldStatus.resolve(Response.json({ passkey: true, authenticator: false, verified: false, pending: false }));
      await refetch;
    });
    expect(screen.getByText("Protected content")).toBeInTheDocument();
    expect(startAuthentication).toHaveBeenCalledTimes(1);
  });

  it.each(["options", "verify", "confirmation"])("keeps access blocked after an %s failure", async (failure) => {
    const clerk = fakeClerk();
    clerk.session = fakeSession();
    mockFetch((url) => {
      if (url.endsWith(`/authenticate/${failure}`)) return [503, { error: "Verification unavailable" }];
      if (url.endsWith("/options")) return [200, { options: {}, challengeId: "c1" }];
      if (url.endsWith("/verify")) return [200, { verified: true }];
      return [200, { passkey: true, authenticator: false, verified: false, pending: false }];
    });
    vi.mocked(startAuthentication).mockResolvedValue({ id: "pk_1" } as never);
    flow();
    expect(await screen.findByRole("alert")).toHaveTextContent(failure === "confirmation" ? "Complete two-step verification" : "Verification unavailable");
    expect(screen.getByRole("button", { name: "Try passkey again" })).toBeEnabled();
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
    expect(clerk.setActive).not.toHaveBeenCalled();
  });

  it.each(["insecure", "unsupported"])("explains an %s browser without opening setup choices", async (reason) => {
    const clerk = fakeClerk();
    clerk.session = fakeSession();
    const { calls } = securityServer();
    if (reason === "insecure") vi.stubGlobal("isSecureContext", false);
    else vi.stubGlobal("PublicKeyCredential", undefined);
    flow();
    expect(await screen.findByText(/Open this page over HTTPS/)).toBeInTheDocument();
    expect(startAuthentication).not.toHaveBeenCalled();
    expect(calls.some((call) => call.url.endsWith("/options"))).toBe(false);
    expect(screen.queryByRole("button", { name: /Create a passkey|Set up authenticator/ })).not.toBeInTheDocument();
  });

  it("ignores an old prompt after a session change and prompts the new session once", async () => {
    const clerk = fakeClerk();
    clerk.session = fakeSession();
    const { calls } = securityServer();
    const oldPrompt = deferred<Awaited<ReturnType<typeof startAuthentication>>>();
    vi.mocked(startAuthentication).mockReturnValueOnce(oldPrompt.promise);
    const view = flow();
    await waitFor(() => expect(startAuthentication).toHaveBeenCalledTimes(1));
    clerk.session = { ...fakeSession(), id: "sess_2" };
    view.rerender();
    await waitFor(() => expect(startAuthentication).toHaveBeenCalledTimes(2));
    await act(async () => { oldPrompt.resolve({ id: "old-pk" } as never); });
    expect(calls.some((call) => call.url.endsWith("/verify"))).toBe(false);
    expect(clerk.setActive).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("ignores a prompt result after leaving the verification screen", async () => {
    const clerk = fakeClerk();
    clerk.session = fakeSession();
    const { calls } = securityServer();
    const prompt = deferred<Awaited<ReturnType<typeof startAuthentication>>>();
    vi.mocked(startAuthentication).mockReturnValueOnce(prompt.promise);
    const view = flow();
    await waitFor(() => expect(startAuthentication).toHaveBeenCalledTimes(1));
    view.unmount();
    await act(async () => { prompt.resolve({ id: "pk_1" } as never); });
    expect(calls.some((call) => call.url.endsWith("/verify"))).toBe(false);
    expect(clerk.setActive).not.toHaveBeenCalled();
  });
});
