import { render, screen } from "@testing-library/react";
import { useQuery } from "@tanstack/react-query";
import { afterEach, describe, expect, it } from "vitest";
import { UserScopedQueries } from "./UserScopedQueries";

const as = (userId: string) => ((globalThis as { __clerkUserId?: string }).__clerkUserId = userId);

function Probe() {
  const { userId } = { userId: (globalThis as { __clerkUserId?: string }).__clerkUserId };
  const { data } = useQuery({ queryKey: ["me"], queryFn: async () => `${userId}'s property`, staleTime: 60_000 });
  return <p>{data ?? "loading"}</p>;
}

afterEach(() => {
  as("user_1");
  delete (globalThis as { __clerkSessionId?: string }).__clerkSessionId;
});

describe("UserScopedQueries", () => {
  it("drops cached data when the same person gets a new session", async () => {
    const auth = globalThis as { __clerkSessionId?: string };
    auth.__clerkSessionId = "first-session";
    let value = "previous session data";
    function SessionProbe() {
      const { data } = useQuery({ queryKey: ["private"], queryFn: async () => value, staleTime: Infinity });
      return <p>{data ?? "loading"}</p>;
    }
    const { rerender } = render(<UserScopedQueries><SessionProbe /></UserScopedQueries>);
    await screen.findByText("previous session data");
    auth.__clerkSessionId = "second-session";
    value = "new session data";
    rerender(<UserScopedQueries><SessionProbe /></UserScopedQueries>);
    expect(screen.queryByText("previous session data")).not.toBeInTheDocument();
    expect(await screen.findByText("new session data")).toBeInTheDocument();
  });

  it("never shows one person's cached data to the next person who signs in", async () => {
    as("user_a");
    const { rerender } = render(
      <UserScopedQueries>
        <Probe />
      </UserScopedQueries>,
    );
    expect(await screen.findByText("user_a's property")).toBeInTheDocument();

    as("user_b");
    rerender(
      <UserScopedQueries>
        <Probe />
      </UserScopedQueries>,
    );
    expect(screen.queryByText("user_a's property")).not.toBeInTheDocument();
    expect(await screen.findByText("user_b's property")).toBeInTheDocument();
  });
});
