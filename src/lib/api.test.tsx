import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "../components/ui";
import { mockFetch } from "../test/render";
import { useApi } from "./api";

afterEach(() => vi.unstubAllGlobals());

describe("double-click protection", () => {
  it("shares an identical write that's still in flight, but not reads or different writes", async () => {
    const calls = mockFetch(() => [200, { ok: true }]);
    const { result } = renderHook(() => useApi());
    const api = result.current;
    const body = JSON.stringify({ body: "Thanks, we're on it." });
    await act(() => Promise.all([api("/admin/reports/r1/replies", { method: "POST", body }), api("/admin/reports/r1/replies", { method: "POST", body })]));
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(1);
    await act(() => api("/admin/reports/r1/replies", { method: "POST", body: JSON.stringify({ body: "Another" }) }));
    await act(() => Promise.all([api("/admin/reports"), api("/admin/reports")]));
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(2);
    expect(calls.filter((c) => c.method === "GET")).toHaveLength(2);
  });

  it("keeps a button disabled while its action runs and ignores a double-click", async () => {
    let finish!: () => void;
    const onClick = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    render(<Button onClick={onClick}>Send contract</Button>);
    const button = screen.getByRole("button", { name: "Send contract" });
    await userEvent.dblClick(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    await act(async () => finish());
    expect(button).toBeEnabled();
  });
});
