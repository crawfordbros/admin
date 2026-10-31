import { isClerkAPIResponseError } from "@clerk/clerk-react/errors";
import { AUTH_EN, type AuthCopy } from "./authCopy";

export { CBES_EMAIL } from "./authCopy";

/** One error from Clerk's API, including those it leaves on a sign-in after the Google redirect. */
export function apiErrorMessage(error: { code: string; message?: string; longMessage?: string }, copy: AuthCopy = AUTH_EN): string {
  // user_locked falls through: Clerk's longMessage says how long the lockout lasts.
  return copy.errors[error.code] ?? error.longMessage ?? error.message ?? copy.somethingWrong;
}

/** A plain-language message for anything Clerk throws during sign-in or account setup. */
export function authErrorMessage(err: unknown, copy: AuthCopy = AUTH_EN): string {
  if (isClerkAPIResponseError(err)) {
    const first = err.errors[0];
    return first ? apiErrorMessage(first, copy) : copy.somethingWrong;
  }
  if (err instanceof Error && err.message) return err.message;
  return copy.somethingWrong;
}
