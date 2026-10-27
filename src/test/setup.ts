import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => cleanup());

// Pages call the API with useAuth().getToken(); tests stand in for Clerk.
vi.mock("@clerk/clerk-react", () => ({
  // Tests switch users by setting globalThis.__clerkUserId.
  useAuth: () => ({ isLoaded: true, getToken: async () => "session-token", userId: (globalThis as { __clerkUserId?: string }).__clerkUserId ?? "user_1" }),
  useUser: () => ({ isLoaded: true, isSignedIn: true, user: { firstName: "Pat", publicMetadata: { role: "manager" } } }),
  // Sign-in and invitation tests supply these (see src/test/clerk.ts).
  useSignIn: vi.fn(),
  useSignUp: vi.fn(),
  useClerk: vi.fn(),
  RedirectToSignIn: () => "Sign in required",
}));
