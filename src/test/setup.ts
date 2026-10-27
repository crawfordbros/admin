import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => cleanup());

// Pages call the API with useAuth().getToken(); tests stand in for Clerk.
vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({ getToken: async () => "session-token" }),
  useUser: () => ({ isLoaded: true, isSignedIn: true, user: { firstName: "Pat", publicMetadata: { role: "manager" } } }),
}));
