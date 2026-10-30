import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useClerk } from "@clerk/clerk-react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MyNotifications, TeamResponse } from "../../../lib/api";
import { mockFetch, renderRoute } from "../../../test/render";
import { TeamSettingsPage } from "./TeamSettingsPage";

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

const detail = {
  organization: { id: "org1", name: "Peachtree Residential", status: "active", serviceArea: null, customerSince: null, propertyLimit: 100, logoVersion: null, phone: "(404) 555-0182", billingEmail: "ap@peachtreeres.com", createdAt: ago(90) },
  kpis: { properties: 2, units: 300, openReports: 0, oldestOpenHours: null, avgReplyHours: null },
  properties: [
    { id: "p1", name: "The Oaks at Decatur" },
    { id: "p2", name: "Brookhaven Terrace" },
  ],
  representatives: [],
  staff: [],
  invitations: [],
};

const teamData = (): TeamResponse => ({
  team: [
    { id: "u1", name: "Lauren Kim", email: "lauren@peachtreeres.com", role: "representative", you: true, properties: "all", receivesWeeklyReport: true, lastSeenAt: ago(0), mfa: "passkey" },
    { id: "u2", name: "James Wu", email: "james@peachtreeres.com", role: "representative", you: false, properties: "all", receivesWeeklyReport: true, lastSeenAt: ago(1), mfa: "authenticator" },
    { id: "u3", name: "Chris Patel", email: "c.patel@peachtreeres.com", role: "manager", you: false, properties: [{ id: "p1", name: "The Oaks at Decatur" }], receivesWeeklyReport: true, lastSeenAt: null, mfa: "none" },
  ],
  invitations: [
    { id: "i1", email: "m.ortega@peachtreeres.com", name: null, role: "manager", properties: [{ id: "p2", name: "Brookhaven Terrace" }], receivesWeeklyReport: true, createdAt: ago(10) },
    { id: "i2", email: "k.james@peachtreeres.com", name: "Kay James", role: "manager", properties: [{ id: "p1", name: "The Oaks at Decatur" }], receivesWeeklyReport: false, createdAt: ago(2) },
  ],
});

const prefs: MyNotifications = {
  prefs: { violationsSent: true, newIssues: true, issueUpdates: false, inviteAccepted: false, weeklyRollup: true },
  weeklyReport: { on: false, locked: false, applies: false },
};

type Extra = (url: string, method: string, body: unknown) => [number, unknown] | undefined;
const api = (extra: Extra = () => undefined) =>
  mockFetch((url, method, body) => {
    const hit = extra(url, method, body);
    if (hit) return hit;
    if (url === "/api/organizations/org1") return [200, detail];
    if (url === "/api/organizations/org1/team") return [200, teamData()];
    if (url === "/api/portal/me/notifications") return method === "PATCH" ? [200, { ...prefs, prefs: { ...prefs.prefs, ...(body as object) } }] : [200, prefs];
    if (url.endsWith("/auth/mfa/status")) return [200, { passkey: true, authenticator: false, verified: true, pending: false }];
    if (method !== "GET") return [204, null];
    return [404, { error: "Not found" }];
  });

const show = (url = "/portal/organizations/org1/settings") => renderRoute("/portal/organizations/:orgId/settings", url, <TeamSettingsPage />);

beforeEach(() => {
  vi.stubGlobal("__clerkRole", "representative");
  vi.mocked(useClerk).mockReturnValue({ session: { id: "sess_1", getToken: async () => "session-token" } } as never);
});
afterEach(() => vi.unstubAllGlobals());

describe("TeamSettingsPage", () => {
  it("shows the team, with Edit access for managers only", async () => {
    api();
    show();
    const table = within(await screen.findByRole("table", { name: "Your team" }));
    expect(screen.getByRole("heading", { level: 1, name: "Team and settings" })).toBeInTheDocument();
    expect(screen.getByText(/keep Peachtree Residential's details current/)).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Team 3" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Invitations 2" })).toBeInTheDocument();
    expect(table.getByText("(you)")).toBeInTheDocument();
    expect(table.getByRole("link", { name: "Profile" })).toHaveAttribute("href", "/portal/settings");
    expect(table.getByRole("button", { name: "Edit access for Chris Patel" })).toBeInTheDocument();
    expect(table.queryByRole("button", { name: /Edit access for James Wu/ })).not.toBeInTheDocument();
    expect(table.getAllByText("All properties")).toHaveLength(2);
    expect(document.title).toBe("Team and settings | CBES Portal");
  });

  it("filters the team by name or email", async () => {
    api();
    show();
    await screen.findByRole("table", { name: "Your team" });
    await userEvent.type(screen.getByRole("searchbox", { name: "Search team" }), "patel");
    const table = within(screen.getByRole("table", { name: "Your team" }));
    expect(table.getByText("Chris Patel")).toBeInTheDocument();
    expect(table.queryByText("James Wu")).not.toBeInTheDocument();
  });

  it("invites a property manager to the properties chosen, with the weekly report choice", async () => {
    const calls = api((url, method) => (url === "/api/organizations/org1/invitations" && method === "POST" ? [201, { status: "invited" }] : undefined));
    show();
    await screen.findByRole("table", { name: "Your team" });
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Work email"), "dee@peachtreeres.com");
    await userEvent.click(screen.getByRole("button", { name: "Send invitation" }));
    expect(await screen.findByText("Choose at least one property")).toBeInTheDocument();
    expect(calls.some((c) => c.url.endsWith("/invitations"))).toBe(false);

    await userEvent.click(screen.getByRole("checkbox", { name: "Brookhaven Terrace" }));
    await userEvent.click(screen.getByRole("switch", { name: "Send them the Monday weekly report" }));
    await userEvent.click(screen.getByRole("button", { name: "Send invitation" }));
    expect(await screen.findByText("Invitation sent to dee@peachtreeres.com.")).toBeInTheDocument();
    expect(calls.find((c) => c.url === "/api/organizations/org1/invitations")?.body).toEqual({
      email: "dee@peachtreeres.com",
      name: "",
      role: "manager",
      propertyIds: ["p2"],
      receivesWeeklyReport: false,
    });
    expect(screen.getByLabelText("Work email")).toHaveValue("");
  });

  it("shows when each invitation expires, resends, and revokes every property sent together", async () => {
    const calls = api();
    show();
    const table = within(await screen.findByRole("table", { name: "Invitations waiting to be accepted" }));
    expect(table.getByText("Expired")).toBeInTheDocument();
    expect(table.getByText("Expires in 5 days")).toBeInTheDocument();
    await userEvent.click(table.getByRole("button", { name: "Resend the invitation to m.ortega@peachtreeres.com" }));
    expect(await screen.findByText("Invitation sent again to m.ortega@peachtreeres.com.")).toBeInTheDocument();
    expect(calls.some((c) => c.url === "/api/organizations/org1/invitations/i1/resend" && c.method === "POST")).toBe(true);

    await userEvent.click(table.getByRole("button", { name: "Revoke the invitation to k.james@peachtreeres.com" }));
    const dialog = within(screen.getByRole("dialog", { name: "Revoke invitation" }));
    await userEvent.click(dialog.getByRole("button", { name: "Revoke" }));
    await waitFor(() => expect(calls.some((c) => c.url === "/api/organizations/org1/invitations/i2?everyProperty=1" && c.method === "DELETE")).toBe(true));
  });

  it("edits a manager's properties and weekly report", async () => {
    const calls = api((url, method) => (url === "/api/organizations/org1/team/u3" && method === "PATCH" ? [200, { member: null }] : undefined));
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Edit access for Chris Patel" }));
    const dialog = within(screen.getByRole("dialog", { name: "Edit access" }));
    await userEvent.click(dialog.getByRole("checkbox", { name: "Brookhaven Terrace" }));
    await userEvent.click(dialog.getByRole("switch", { name: "Monday weekly report" }));
    await userEvent.click(dialog.getByRole("button", { name: "Save access" }));
    expect(await screen.findByText("Access updated for Chris Patel.")).toBeInTheDocument();
    expect(calls.find((c) => c.url === "/api/organizations/org1/team/u3")?.body).toEqual({ propertyIds: ["p1", "p2"], receivesWeeklyReport: false });
  });

  it("removes a manager after confirming", async () => {
    const calls = api();
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Edit access for Chris Patel" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove from Peachtree Residential" }));
    const dialog = within(screen.getByRole("dialog", { name: "Remove Chris Patel?" }));
    expect(dialog.getByText(/lose access to every Peachtree Residential property/)).toBeInTheDocument();
    await userEvent.click(dialog.getByRole("button", { name: "Remove" }));
    expect(await screen.findByText("Chris Patel was removed from Peachtree Residential.")).toBeInTheDocument();
    expect(calls.some((c) => c.url === "/api/organizations/org1/team/u3" && c.method === "DELETE")).toBe(true);
  });

  it("saves the organization profile and shows field errors", async () => {
    let attempt = 0;
    const calls = api((url, method) =>
      url === "/api/organizations/org1" && method === "PATCH"
        ? ++attempt === 1
          ? [422, { error: "Please fix the highlighted fields.", fieldErrors: { phone: "Enter a phone number like (404) 555-0182" } }]
          : [200, { organization: detail.organization }]
        : undefined,
    );
    show("/portal/organizations/org1/settings?tab=organization");
    const phone = await screen.findByLabelText(/Main office phone/);
    await userEvent.clear(phone);
    await userEvent.type(phone, "call me");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Enter a phone number like (404) 555-0182")).toBeInTheDocument();
    await userEvent.clear(phone);
    await userEvent.type(phone, "(404) 555-0100");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Organization saved.")).toBeInTheDocument();
    expect(calls.filter((c) => c.url === "/api/organizations/org1" && c.method === "PATCH").at(-1)?.body).toEqual({
      name: "Peachtree Residential",
      phone: "(404) 555-0100",
      billingEmail: "ap@peachtreeres.com",
    });
  });

  it("saves each notification switch as it's flipped, and shows how you sign in", async () => {
    const calls = api();
    show("/portal/organizations/org1/settings?tab=notifications");
    const invite = await screen.findByRole("switch", { name: "Invitation accepted" });
    expect(screen.getByRole("switch", { name: "Updates on issues I follow" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("switch", { name: "Monday weekly report" })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(invite);
    await waitFor(() => expect(calls.find((c) => c.url === "/api/portal/me/notifications" && c.method === "PATCH")?.body).toEqual({ inviteAccepted: true }));
    expect(invite).toHaveAttribute("aria-checked", "true");
    expect(await screen.findByText("Passkey")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage sign-in methods" })).toHaveAttribute("href", "/portal/settings");
  });

  it("explains a failure", async () => {
    api((url) => (url === "/api/organizations/org1/team" ? [500, { error: "The team is unavailable." }] : undefined));
    show();
    expect(await screen.findByRole("alert")).toHaveTextContent("The team is unavailable.");
  });
});
