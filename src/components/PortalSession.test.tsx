import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeClerk, fakeSession } from "../test/clerk";
import { mockFetch } from "../test/render";
import { endSession, IDLE_MS, lastActivity, publishActivity, releaseSession, WARNING_MS } from "../lib/sessionState";
import { clearTokenRefresh } from "../lib/authenticatedRequest";
import { PortalSessionActivity, PortalSessionBoundary, INACTIVITY_NOTICE } from "./PortalSession";

const id = "sess_1";
function Location() { const location = useLocation(); return <output data-testid="path">{location.pathname + location.search}</output>; }
beforeEach(() => { localStorage.clear(); releaseSession(id); clearTokenRefresh(id); });
afterEach(() => { releaseSession(id); clearTokenRefresh(id); localStorage.clear(); vi.restoreAllMocks(); });

function open(initial = Date.now(), path = "/admin/organizations?tab=active") {
  const clerk = fakeClerk();
  clerk.session = fakeSession();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["private"], "sensitive data");
  const calls = mockFetch((url) => {
    if (url.endsWith("/end")) return [204, null];
    const at = url.endsWith("/activity") ? Date.now() : initial;
    return [200, { serverTime: Date.now(), lastActivityAt: at, expiresAt: at + IDLE_MS }];
  });
  const view = render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}>
    <PortalSessionBoundary><PortalSessionActivity><p>Protected portal content</p></PortalSessionActivity></PortalSessionBoundary>
    <Location />
  </MemoryRouter></QueryClientProvider>);
  return { clerk, client, calls, ...view };
}

describe("portal session boundary", () => {
  it("shows the warning and renews with an explicit Stay signed in action", async () => {
    const initial = Date.now() - WARNING_MS;
    publishActivity(id, initial);
    const { calls } = open(initial);
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("Are you still here?");
    await userEvent.click(screen.getByRole("button", { name: "Stay signed in" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    await waitFor(() => expect(calls.some((c) => c.url.endsWith("/activity"))).toBe(true));
    expect(Date.now() - lastActivity(id)!).toBeLessThan(1000);
    expect(screen.getByText("Protected portal content")).toBeVisible();
  });

  it.each(["/admin/organizations?tab=active", "/portal/organizations/org-1"])("locks %s, clears cached data and signs out only this session", async (path) => {
    const { clerk, client } = open(Date.now(), path);
    await screen.findByText("Protected portal content");
    act(() => endSession(id, "idle"));
    expect(screen.queryByText("Protected portal content")).not.toBeInTheDocument();
    expect(screen.getByText(INACTIVITY_NOTICE)).toBeVisible();
    expect(client.getQueryData(["private"])).toBeUndefined();
    await waitFor(() => expect(clerk.signOut).toHaveBeenCalledWith({ sessionId: id, redirectUrl: `/portal/login?reason=inactivity&redirect_url=${encodeURIComponent(path)}` }));
    expect(screen.getByTestId("path")).toHaveTextContent("/portal/login?reason=inactivity");
  });

  it("stays locked if sign-out is offline and retries after reconnect", async () => {
    const { clerk, unmount } = open();
    clerk.signOut.mockRejectedValue(new TypeError("offline"));
    await screen.findByText("Protected portal content");
    act(() => endSession(id, "idle"));
    expect(await screen.findByRole("button", { name: "Return to sign in" })).toBeVisible();
    expect(screen.queryByText("Protected portal content")).not.toBeInTheDocument();
    // Simulate a page reload while Clerk still holds the same session.
    unmount();
    const reload = open();
    reload.clerk.signOut.mockRejectedValue(new TypeError("offline"));
    expect(screen.queryByText("Protected portal content")).not.toBeInTheDocument();
    await screen.findByRole("button", { name: "Return to sign in" });
    reload.clerk.signOut.mockResolvedValue(undefined);
    act(() => window.dispatchEvent(new Event("online")));
    await waitFor(() => expect(reload.clerk.signOut).toHaveBeenCalledTimes(2));
  });
});
