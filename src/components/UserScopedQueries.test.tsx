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

afterEach(() => as("user_1"));

describe("UserScopedQueries", () => {
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
