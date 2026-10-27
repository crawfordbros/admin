import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { clerkError, fakeClerk, fakeSignUp } from "../test/clerk";
import { renderRoute } from "../test/render";
import { AcceptInvitePage } from "./AcceptInvitePage";

const accept = (url: string) => renderRoute("/portal/accept-invite/*", url, <AcceptInvitePage />);
const location = () => screen.getByTestId("location");

describe("AcceptInvitePage", () => {
  it("asks for the invitation link when there's no ticket", () => {
    fakeClerk();
    fakeSignUp();
    accept("/portal/accept-invite");
    expect(screen.getByText("Use the link in your invitation email from CBES.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/portal/login");
  });

  it("sends people who already have an account to sign in with the ticket", () => {
    fakeClerk();
    fakeSignUp();
    accept("/portal/accept-invite?__clerk_ticket=tkt_1&__clerk_status=sign_in");
    expect(location()).toHaveTextContent("/portal/login?__clerk_ticket=tkt_1&__clerk_status=sign_in");
  });

  it("creates the account, then sets up two-step verification", async () => {
    const user = {
      createTOTP: vi.fn(async () => ({ uri: "otpauth://totp/CBES:pat?secret=JBSWY3DPEHPK3PXP", secret: "JBSWY3DPEHPK3PXP" })),
      verifyTOTP: vi.fn(async () => ({})),
    };
    const clerk = fakeClerk({ task: "setup-mfa", user });
    const signUp = fakeSignUp();
    signUp.create.mockResolvedValue({ emailAddress: "pat@demo-mgmt.com" });
    signUp.update.mockResolvedValue({ status: "complete", createdSessionId: "sess_2", missingFields: [] });
    accept("/portal/accept-invite?__clerk_ticket=tkt_1&__clerk_status=sign_up");

    expect(await screen.findByText("pat@demo-mgmt.com")).toBeInTheDocument();
    expect(signUp.create).toHaveBeenCalledWith({ strategy: "ticket", ticket: "tkt_1" });
    await userEvent.type(screen.getByLabelText("Password"), "a long enough passphrase");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(signUp.update).toHaveBeenCalledWith({ password: "a long enough passphrase" });

    expect(await screen.findByRole("heading", { name: "Add two-step verification" })).toBeInTheDocument();
    expect(clerk.setActive).toHaveBeenCalledWith(expect.objectContaining({ session: "sess_2" }));
    expect(location()).toHaveTextContent("/portal/accept-invite");

    await userEvent.type(await screen.findByLabelText("Code from the app"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Turn on two-step verification" }));
    await waitFor(() => expect(location()).toHaveTextContent(/^\/portal$/));
  });

  it("explains a link that no longer works", async () => {
    fakeClerk();
    const signUp = fakeSignUp();
    signUp.create.mockRejectedValue(clerkError("ticket_expired", "This invitation has expired."));
    accept("/portal/accept-invite?__clerk_ticket=tkt_old&__clerk_status=sign_up");
    expect(await screen.findByRole("heading", { name: "This invitation link didn't work" })).toBeInTheDocument();
    expect(screen.getByText(/This invitation has expired\. Ask CBES to send you a new invitation/)).toBeInTheDocument();
  });
});
