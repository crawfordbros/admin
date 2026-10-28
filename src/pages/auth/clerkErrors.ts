import { isClerkAPIResponseError } from "@clerk/clerk-react/errors";

/** Where people reach CBES about their account. */
export const CBES_EMAIL = "office@cbenvironments.com";

const MESSAGES: Record<string, string> = {
  form_identifier_not_found: `No CBES portal account uses that email. Accounts are by invitation, so email ${CBES_EMAIL} to get one.`,
  external_account_not_found:
    `No CBES portal account uses that Google address. Sign in with the email your invitation went to, or email ${CBES_EMAIL}.`,
  form_password_incorrect: "That password doesn't match this account. Try again or reset it.",
  form_code_incorrect: "That code isn't right. Check the latest email or send a new code.",
  verification_expired: "That code has expired. Send a new code and try again.",
  form_password_pwned: "This password has appeared in a data breach elsewhere. Reset it to sign in.",
  form_password_length_too_short: "Use at least 10 characters.",
  session_exists: "You're already signed in.",
  too_many_requests: "Too many attempts. Wait a minute and try again.",
};

/** One error from Clerk's API, including those it leaves on a sign-in after the Google redirect. */
export function apiErrorMessage(error: { code: string; message?: string; longMessage?: string }): string {
  // user_locked falls through: Clerk's longMessage says how long the lockout lasts.
  return MESSAGES[error.code] ?? error.longMessage ?? error.message ?? "Something went wrong. Try again.";
}

/** A plain-language message for anything Clerk throws during sign-in or account setup. */
export function authErrorMessage(err: unknown): string {
  if (isClerkAPIResponseError(err)) {
    const first = err.errors[0];
    return first ? apiErrorMessage(first) : "Something went wrong. Try again.";
  }
  if (err instanceof Error && err.message) return err.message;
  return "Something went wrong. Try again.";
}
