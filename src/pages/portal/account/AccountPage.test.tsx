import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useClerk } from "@clerk/clerk-react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MyNotifications } from "../../../lib/api";
import { mockFetch, renderRoute } from "../../../test/render";
import { AccountPage } from "./AccountPage";

const property = { id: "p1", name: "The Oaks at Decatur", slug: "oaks", city: "Decatur", memberRole: "manager", organizationId: "org1", organizationName: "Peachtree Residential", photoVersion: null };
const managerMe = { user: { id: "u2", email: "chris@peachtree.com", name: "Chris Patel", role: "manager" }, organizations: [], properties: [property] };
const repMe = {
  user: { id: "u1", email: "lauren@peachtree.com", name: "Lauren Kim", role: "representative" },
  organizations: [{ id: "org1", name: "Peachtree Residential", propertyCount: 1, propertyLimit: 100, logoVersion: null }],
  properties: [property],
};
const prefs = (weeklyReport: MyNotifications["weeklyReport"]): MyNotifications => ({
  prefs: { violationsSent: true, newIssues: true, issueUpdates: true, inviteAccepted: false, weeklyRollup: true },
  weeklyReport,
});

const api = (me: unknown, notifications = prefs({ on: true, locked: false, applies: true })) =>
  mockFetch((url, method, body) => {
    if (url === "/api/portal/me") return [200, me];
    if (url === "/api/portal/me/notifications") {
      if (method !== "PATCH") return [200, notifications];
      const { weeklyReport, ...rest } = body as { weeklyReport?: boolean };
      return [200, { prefs: { ...notifications.prefs, ...rest }, weeklyReport: { ...notifications.weeklyReport, on: weeklyReport ?? notifications.weeklyReport.on } }];
    }
    if (url.endsWith("/auth/mfa/status")) return [200, { passkey: false, authenticator: true, verified: true, pending: false }];
    return [404, { error: "Not found" }];
  });

const show = () => renderRoute("/portal/account", "/portal/account", <AccountPage />);

beforeEach(() => vi.mocked(useClerk).mockReturnValue({ session: { id: "sess_1", getToken: async () => "session-token" } } as never));
afterEach(() => vi.unstubAllGlobals());

describe("AccountPage", () => {
  it("gives a manager their email choices, sign-in and properties", async () => {
    api(managerMe);
    show();
    expect(await screen.findByRole("heading", { level: 1, name: "My account" })).toBeInTheDocument();
    expect(await screen.findByRole("switch", { name: "Monday weekly report" })).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByRole("switch", { name: "Invitation accepted" })).not.toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /The Oaks at Decatur/ })).toHaveAttribute("href", "/portal/properties/p1");
    expect(await screen.findByText("Authenticator app")).toBeInTheDocument();
    expect(document.title).toBe("My account | CBES Portal");
  });

  it("turns the Monday report off for every property", async () => {
    const calls = api(managerMe);
    show();
    const weekly = await screen.findByRole("switch", { name: "Monday weekly report" });
    await userEvent.click(weekly);
    await waitFor(() => expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ weeklyReport: false }));
    expect(weekly).toHaveAttribute("aria-checked", "false");
  });

  it("can't turn the Monday report on before they have a property", async () => {
    api({ ...managerMe, properties: [] }, prefs({ on: false, locked: false, applies: false }));
    show();
    expect(await screen.findByRole("switch", { name: "Monday weekly report" })).toBeDisabled();
    expect(screen.getByText("Starts when you're added to a property")).toBeInTheDocument();
    expect(screen.getByText(/No properties yet/)).toBeInTheDocument();
  });

  it("sends a Representative to their Team and settings notifications", async () => {
    api(repMe);
    show();
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/portal/organizations/org1/settings?tab=notifications"));
  });
});
