import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fakeClerk, fakeSession } from "../../test/clerk";
import { mockFetch } from "../../test/render";
import { clearTokenRefresh } from "../../lib/authenticatedRequest";
import { endedKey, IDLE_MS, releaseSession } from "../../lib/sessionState";
import { PortalSessionActivity, PortalSessionBoundary } from "../PortalSession";
import { AccountMenu } from "./AccountMenu";

const id = "sess_1";
const g = globalThis as { __clerkUser?: unknown };

function Location() {
  const location = useLocation();
  return <output data-testid="path">{location.pathname + location.search}</output>;
}

function open(settingsPath = "/admin/settings/account") {
  const clerk = fakeClerk();
  clerk.session = fakeSession();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["private"], "sensitive data");
  mockFetch((url) => (url.endsWith("/end") ? [204, null] : [200, { serverTime: Date.now(), lastActivityAt: Date.now(), expiresAt: Date.now() + IDLE_MS }]));
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/admin/reports"]}>
        <PortalSessionBoundary>
          <Routes>
            <Route path="/admin/reports" element={<PortalSessionActivity><AccountMenu settingsPath={settingsPath} /></PortalSessionActivity>} />
            <Route path="*" element={<p>Elsewhere</p>} />
          </Routes>
        </PortalSessionBoundary>
        <Location />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { clerk, client };
}

beforeEach(() => {
  localStorage.clear();
  releaseSession(id);
  clearTokenRefresh(id);
  g.__clerkUser = { fullName: null, primaryEmailAddress: { emailAddress: "nick@cbenvironments.com" }, publicMetadata: { role: "admin" } };
});
afterEach(() => {
  releaseSession(id);
  clearTokenRefresh(id);
  localStorage.clear();
  g.__clerkUser = undefined;
});

describe("account menu", () => {
  it("shows who is signed in and links to Account settings", async () => {
    open();
    const trigger = await screen.findByRole("button", { name: /^Account: nick@cbenvironments\.com/ });
    expect(trigger).toHaveTextContent("Admin");
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menuitem", { name: "Account settings" })).toHaveFocus();
    await userEvent.click(screen.getByRole("menuitem", { name: "Account settings" }));
    expect(screen.getByTestId("path")).toHaveTextContent("/admin/settings/account");
  });

  it("signs out through the portal session: clears data, tells other tabs and lands on sign-in", async () => {
    const { clerk, client } = open();
    await userEvent.click(await screen.findByRole("button", { name: /^Account:/ }));
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(screen.getByText("Signing you out…")).toBeVisible();
    expect(screen.queryByText("Please sign in again to continue.")).not.toBeInTheDocument();
    expect(localStorage.getItem(endedKey(id))).toBe("signout");
    expect(client.getQueryData(["private"])).toBeUndefined();
    await waitFor(() =>
      expect(clerk.signOut).toHaveBeenCalledWith({ sessionId: id, redirectUrl: `/portal/login?reason=signout&redirect_url=${encodeURIComponent("/admin/reports")}` }),
    );
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    open();
    const trigger = await screen.findByRole("button", { name: /^Account:/ });
    await userEvent.click(trigger);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
