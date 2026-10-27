import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { startRegistration } from "@simplewebauthn/browser";
import { fakeClerk, fakeSession, mockSecurity } from "../test/clerk";
import { mockFetch, renderRoute } from "../test/render";
import { RequireSecurity } from "./RequireSecurity";

vi.mock("@simplewebauthn/browser", () => ({ startRegistration: vi.fn(), startAuthentication: vi.fn() }));

const enter = () => renderRoute("/admin", "/admin", <RequireSecurity><p>Protected admin data</p></RequireSecurity>);

beforeEach(() => {
  vi.stubGlobal("isSecureContext", true);
  vi.stubGlobal("PublicKeyCredential", class {});
  vi.mocked(startRegistration).mockReset();
});

describe("required second factor after any first factor", () => {
  it("blocks a Google account on a direct admin URL until a method is enrolled", async () => {
    const clerk = fakeClerk();
    clerk.session = fakeSession({ user: { externalAccounts: [{ provider: "google" }], publicMetadata: { role: "admin" } } });
    mockSecurity({ passkey: false, authenticator: false, verified: false, pending: false });
    enter();
    expect(await screen.findByRole("button", { name: "Create a passkey" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Set up authenticator app" })).toBeEnabled();
    expect(screen.queryByText("Protected admin data")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /skip/i })).not.toBeInTheDocument();
  });

  it("requires proof again when the account already has a passkey", async () => {
    const clerk = fakeClerk();
    clerk.session = fakeSession();
    mockSecurity({ passkey: true, authenticator: false, verified: false, pending: false });
    enter();
    expect(await screen.findByRole("button", { name: "Verify with passkey" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Set up authenticator app" })).not.toBeInTheDocument();
    expect(screen.queryByText("Protected admin data")).not.toBeInTheDocument();
  });

  it("keeps the portal blocked when the device prompt is cancelled", async () => {
    const clerk = fakeClerk();
    clerk.session = fakeSession();
    mockSecurity({ passkey: false, authenticator: false, verified: false, pending: false });
    vi.mocked(startRegistration).mockRejectedValue(new DOMException("Cancelled", "NotAllowedError"));
    enter();
    await userEvent.click(await screen.findByRole("button", { name: "Create a passkey" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("cancelled or timed out");
    expect(screen.queryByText("Protected admin data")).not.toBeInTheDocument();
    expect(clerk.setActive).not.toHaveBeenCalled();
  });

  it("enters only after the server verifies the newly created passkey", async () => {
    const clerk = fakeClerk();
    clerk.session = fakeSession();
    let verified = false;
    mockFetch((url) => {
      if (url.endsWith("/register/options")) return [200, { options: {}, challengeId: "challenge-1" }];
      if (url.endsWith("/register/verify")) { verified = true; return [200, { verified: true }]; }
      return [200, { passkey: verified, authenticator: false, verified, pending: false }];
    });
    vi.mocked(startRegistration).mockResolvedValue({ id: "passkey-1" } as never);
    enter();
    await userEvent.click(await screen.findByRole("button", { name: "Create a passkey" }));
    expect(await screen.findByText("Protected admin data")).toBeInTheDocument();
    await waitFor(() => expect(clerk.setActive).toHaveBeenCalled());
  });

  it("fails closed when the security check is unavailable", async () => {
    const clerk = fakeClerk();
    clerk.session = fakeSession();
    mockFetch(() => [503, { error: "Security check unavailable" }]);
    enter();
    expect(await screen.findByRole("alert")).toHaveTextContent("Security check unavailable");
    expect(screen.queryByText("Protected admin data")).not.toBeInTheDocument();
  });

  it("explains an HTML challenge response without exposing a JSON parsing error", async () => {
    const clerk = fakeClerk();
    clerk.session = fakeSession();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<!DOCTYPE html><title>Just a moment…</title>", {
      status: 403, headers: { "Content-Type": "text/html", "cf-mitigated": "challenge" },
    })));
    enter();
    expect(await screen.findByRole("alert")).toHaveTextContent("security service interrupted verification");
    expect(screen.queryByText("Protected admin data")).not.toBeInTheDocument();
  });
});
