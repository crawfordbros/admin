import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { clerkError, fakeClerk, fakeSession, fakeSignIn, mockSecurity } from "../test/clerk";
import { renderRoute } from "../test/render";
import { LoginPage } from "./LoginPage";

const login = (url = "/portal/login") => renderRoute("/portal/login/*", url, <LoginPage />);
const location = () => screen.getByTestId("location");

describe("LoginPage", () => {
  it("signs in with email and password", async () => {
    const clerk = fakeClerk();
    const signIn = fakeSignIn();
    signIn.create.mockResolvedValue({ ...signIn, supportedFirstFactors: [{ strategy: "password" }] });
    signIn.attemptFirstFactor.mockResolvedValue({ ...signIn, status: "complete", createdSessionId: "sess_1" });
    login();

    await userEvent.type(screen.getByLabelText("Email address"), "pat@demo-mgmt.com");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(signIn.create).toHaveBeenCalledWith({ identifier: "pat@demo-mgmt.com" });

    expect(await screen.findByRole("heading", { name: "Enter your password" })).toHaveFocus();
    expect(screen.getByText("pat@demo-mgmt.com")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Password"), "correct horse battery staple");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(signIn.attemptFirstFactor).toHaveBeenCalledWith({ strategy: "password", password: "correct horse battery staple" });
    await waitFor(() => expect(location()).toHaveTextContent("/portal"));
    expect(clerk.setActive).toHaveBeenCalledWith(expect.objectContaining({ session: "sess_1" }));
  });

  it("explains that accounts are by invitation when the email is unknown", async () => {
    fakeClerk();
    const signIn = fakeSignIn();
    signIn.create.mockRejectedValue(clerkError("form_identifier_not_found"));
    login();

    await userEvent.type(screen.getByLabelText("Email address"), "stranger@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No CBES portal account uses that email.");
    expect(screen.queryByRole("link", { name: /sign up/i })).not.toBeInTheDocument();
  });

  it("asks for the authenticator code when the account has two-step verification", async () => {
    fakeClerk();
    const signIn = fakeSignIn();
    signIn.create.mockResolvedValue({ ...signIn, supportedFirstFactors: [{ strategy: "password" }] });
    signIn.attemptFirstFactor.mockResolvedValue({ ...signIn, status: "needs_second_factor", supportedSecondFactors: [{ strategy: "totp" }] });
    signIn.attemptSecondFactor.mockResolvedValue({ ...signIn, status: "complete", createdSessionId: "sess_1" });
    login();

    await userEvent.type(screen.getByLabelText("Email address"), "nick@cbenvironments.com");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await userEvent.type(await screen.findByLabelText("Password"), "correct horse battery staple");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("heading", { name: "Two-step verification" })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Code from the app"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Verify code" }));
    expect(signIn.attemptSecondFactor).toHaveBeenCalledWith({ strategy: "totp", code: "123456" });
    await waitFor(() => expect(location()).toHaveTextContent("/portal"));
  });

  it("emails a code to someone without a password", async () => {
    fakeClerk();
    const signIn = fakeSignIn();
    const factors = [{ strategy: "email_code", emailAddressId: "idn_1", safeIdentifier: "p***@demo-mgmt.com" }];
    signIn.create.mockResolvedValue({ ...signIn, supportedFirstFactors: factors });
    signIn.prepareFirstFactor.mockResolvedValue(signIn);
    signIn.attemptFirstFactor.mockResolvedValue({ ...signIn, status: "complete", createdSessionId: "sess_1" });
    login();

    await userEvent.type(screen.getByLabelText("Email address"), "pat@demo-mgmt.com");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("heading", { name: "Check your email" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Send a new code in \d+s/ })).toBeDisabled();

    await userEvent.type(screen.getByLabelText("Verification code"), "424242");
    await userEvent.click(screen.getByRole("button", { name: "Verify code" }));
    expect(signIn.attemptFirstFactor).toHaveBeenCalledWith({ strategy: "email_code", code: "424242" });
    await waitFor(() => expect(location()).toHaveTextContent("/portal"));
  });

  it("redeems an invitation ticket for someone who already has an account", async () => {
    fakeClerk();
    const signIn = fakeSignIn();
    signIn.create.mockResolvedValue({ ...signIn, status: "complete", createdSessionId: "sess_1" });
    login("/portal/login?__clerk_ticket=tkt_1&__clerk_status=sign_in");

    await waitFor(() => expect(location()).toHaveTextContent(/^\/portal$/));
    expect(signIn.create).toHaveBeenCalledWith({ strategy: "ticket", ticket: "tkt_1" });
  });

  it("goes back to the page that sent them to sign in", async () => {
    fakeClerk();
    const signIn = fakeSignIn();
    signIn.create.mockResolvedValue({ ...signIn, supportedFirstFactors: [{ strategy: "password" }] });
    signIn.attemptFirstFactor.mockResolvedValue({ ...signIn, status: "complete", createdSessionId: "sess_1" });
    login(`/portal/login?redirect_url=${encodeURIComponent(`${window.location.origin}/admin/properties`)}`);

    await userEvent.type(screen.getByLabelText("Email address"), "nick@cbenvironments.com");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await userEvent.type(await screen.findByLabelText("Password"), "correct horse battery staple");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(location()).toHaveTextContent("/admin/properties"));
  });

  it("explains when a Google account has no CBES account", () => {
    fakeClerk();
    fakeSignIn({ firstFactorVerification: { status: "transferable", strategy: "oauth_google", error: null } });
    login();
    expect(screen.getByRole("alert")).toHaveTextContent("No CBES portal account uses that Google address.");
  });

  it("sets up two-step verification when the session is waiting on it", async () => {
    mockSecurity();
    const user = {
      createTOTP: vi.fn(async () => ({ uri: "otpauth://totp/CBES:pat?secret=JBSWY3DPEHPK3PXP", secret: "JBSWY3DPEHPK3PXP" })),
      verifyTOTP: vi.fn(async () => ({})),
    };
    const clerk = fakeClerk({ user });
    clerk.session = fakeSession({ task: "setup-mfa", user });
    const session = clerk.session;
    fakeSignIn();
    login();

    expect(await screen.findByRole("heading", { name: "Add two-step verification" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Set up authenticator app" }));
    expect(await screen.findByText("JBSW Y3DP EHPK 3PXP")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /QR code/ })).toHaveAttribute("src", expect.stringMatching(/^data:image\/svg\+xml/));
    await userEvent.type(screen.getByLabelText("Code from the app"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Verify code and continue" }));
    expect(await screen.findByText(/Your authenticator is saved/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Code from the app"), "234567");
    await userEvent.click(screen.getByRole("button", { name: "Verify code and continue" }));
    expect(user.verifyTOTP).toHaveBeenCalledWith({ code: "123456" });
    expect(user.createTOTP).toHaveBeenCalledTimes(1);
    expect(session.startVerification).toHaveBeenCalledWith({ level: "second_factor" });
    expect(session.attemptSecondFactorVerification).toHaveBeenCalledWith({ strategy: "totp", code: "234567" });
    await waitFor(() => expect(location()).toHaveTextContent(/^\/portal$/));
  });
});
