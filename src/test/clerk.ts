import { useClerk, useSignIn, useSignUp } from "@clerk/clerk-react";
import { vi } from "vitest";

/** isClerkAPIResponseError recognizes Clerk's API errors by the class's `kind`. */
class FakeClerkAPIResponseError extends Error {
  static kind = "ClerkAPIResponseError";
  status = 422;
  constructor(public errors: { code: string; message: string; longMessage: string }[]) {
    super(errors[0]?.message);
  }
}

/** What Clerk throws when the API rejects a sign-in or sign-up step. */
export function clerkError(code: string, longMessage = code) {
  return new FakeClerkAPIResponseError([{ code, message: code, longMessage }]);
}

/** A stand-in sign-in resource. Each method resolves to whatever the test sets. */
export function fakeSignIn(overrides: Record<string, unknown> = {}) {
  const signIn = {
    status: null as string | null,
    identifier: null,
    createdSessionId: null,
    supportedFirstFactors: null,
    supportedSecondFactors: null,
    firstFactorVerification: { status: null, strategy: null, error: null },
    create: vi.fn(),
    prepareFirstFactor: vi.fn(async () => signIn),
    attemptFirstFactor: vi.fn(),
    prepareSecondFactor: vi.fn(async () => signIn),
    attemptSecondFactor: vi.fn(),
    resetPassword: vi.fn(),
    authenticateWithRedirect: vi.fn(),
    // The email step starts passkey autofill; it never settles unless the test says so.
    authenticateWithPasskey: vi.fn(() => new Promise(() => {})),
    ...overrides,
  };
  vi.mocked(useSignIn).mockReturnValue({ isLoaded: true, signIn, setActive: vi.fn() } as never);
  return signIn;
}

export function fakeSignUp(overrides: Record<string, unknown> = {}) {
  const signUp = { create: vi.fn(), update: vi.fn(), ...overrides };
  vi.mocked(useSignUp).mockReturnValue({ isLoaded: true, signUp, setActive: vi.fn() } as never);
  return signUp;
}

/**
 * The Clerk object. setActive calls the page's navigate callback with the session it activates;
 * pass `task` to leave that session pending on a task such as "setup-mfa".
 */
export function fakeClerk({ task, user }: { task?: string; user?: Record<string, unknown> } = {}) {
  const clerk = {
    session: null as null | { id: string; user?: unknown; currentTask?: { key: string } },
    user: null,
    setActive: vi.fn(async ({ session, navigate }: { session: string; navigate?: (p: { session: unknown }) => Promise<unknown> }) => {
      clerk.session = { id: session, user, currentTask: task ? { key: task } : undefined };
      await navigate?.({ session: clerk.session });
      // Once two-step verification is on, the task is done.
      task = undefined;
    }),
  };
  vi.mocked(useClerk).mockReturnValue(clerk as never);
  return clerk;
}
