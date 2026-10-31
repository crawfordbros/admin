import { describe, expect, it } from "vitest";
import { clerkError } from "../../test/clerk";
import { apiErrorMessage, authErrorMessage } from "./clerkErrors";

describe("authErrorMessage", () => {
  it("rewrites the errors people hit most in plain language", () => {
    expect(authErrorMessage(clerkError("form_password_incorrect"))).toBe("That password doesn't match this account. Try again or reset it.");
    expect(authErrorMessage(clerkError("form_identifier_not_found"))).toMatch(/^No CBES portal account uses that email/);
  });

  it("falls back to Clerk's own explanation, which says how long a lockout lasts", () => {
    expect(authErrorMessage(clerkError("user_locked", "Your account is locked. You will be able to try again in 59 minutes."))).toBe(
      "Your account is locked. You will be able to try again in 59 minutes.",
    );
  });

  it("passes through ordinary errors", () => {
    expect(authErrorMessage(new Error("Sign-in didn't finish. Start again."))).toBe("Sign-in didn't finish. Start again.");
    expect(authErrorMessage("nope")).toBe("Something went wrong. Try again.");
  });

  it("handles a single error left on a sign-in", () => {
    expect(apiErrorMessage({ code: "external_account_not_found" })).toMatch(/Google address/);
  });
});
