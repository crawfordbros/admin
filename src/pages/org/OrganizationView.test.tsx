import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OrganizationDetail } from "../../lib/api";
import { mockFetch, renderRoute } from "../../test/render";
import { OrganizationView } from "./OrganizationView";

const org = (overrides: Partial<OrganizationDetail> = {}): OrganizationDetail => ({
  organization: { id: "org1", name: "Demo Management", createdAt: "2026-10-01T12:00:00Z" },
  properties: [
    { id: "p1", name: "Demo Community", slug: "demo-community", city: "Clarkston", status: "active", unitCount: 30, openReports: 2 },
    { id: "p2", name: "Willow Bend", slug: "willow-bend", city: "Tucker", status: "active", unitCount: null, openReports: 0 },
  ],
  representatives: [{ id: "user_rep", email: "riley@demo-mgmt.com", name: "Riley Rep", addedAt: "2026-10-02T12:00:00Z" }],
  staff: [{ id: "user_pm", email: "pat@demo-mgmt.com", name: "Pat Manager", role: "manager", propertyId: "p1", propertyName: "Demo Community" }],
  invitations: [
    { id: "i1", email: "boss@demo-mgmt.com", name: null, role: "representative", propertyId: null, propertyName: null, createdAt: "2026-10-03T12:00:00Z" },
  ],
  ...overrides,
});

const show = (isAdmin: boolean, area: "admin" | "portal" = isAdmin ? "admin" : "portal") =>
  renderRoute("/org/:id", "/org/org1", <OrganizationView id="org1" area={area} isAdmin={isAdmin} />);

afterEach(() => vi.unstubAllGlobals());

describe("OrganizationView", () => {
  it("invites a manager to the properties chosen", async () => {
    const calls = mockFetch((_url, method) => (method === "POST" ? [201, { status: "invited" }] : [200, org()]));
    show(false);

    await userEvent.type(await screen.findByLabelText("Email"), "sam@demo-mgmt.com");
    await userEvent.selectOptions(screen.getByLabelText("Role"), "director");
    await userEvent.click(screen.getByRole("checkbox", { name: "Willow Bend" }));
    await userEvent.click(screen.getByRole("button", { name: "Send invitation" }));

    expect(await screen.findByText(/Invitation sent to sam@demo-mgmt.com/)).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST")).toMatchObject({
      url: "/api/organizations/org1/invitations",
      body: { email: "sam@demo-mgmt.com", name: "", role: "director", propertyIds: ["p2"] },
    });
  });

  it("lets only admins invite or remove representatives", async () => {
    mockFetch(() => [200, org()]);
    show(false);
    const role = await screen.findByLabelText("Role");
    expect(within(role).queryByRole("option", { name: "Representative" })).not.toBeInTheDocument();
    const reps = screen.getByRole("heading", { name: "Representatives" }).closest("section")!;
    expect(within(reps).queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
    // A representative invitation can't be cancelled by a representative either.
    const waiting = screen.getByRole("heading", { name: "Waiting to accept" }).closest("section")!;
    expect(within(waiting).queryByRole("button", { name: "Cancel invitation" })).not.toBeInTheDocument();
  });

  it("invites a representative to the whole organization", async () => {
    const calls = mockFetch((_url, method) => (method === "POST" ? [201, { status: "added" }] : [200, org()]));
    show(true);
    await userEvent.type(await screen.findByLabelText("Email"), "pat@demo-mgmt.com");
    await userEvent.selectOptions(screen.getByLabelText("Role"), "representative");
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Send invitation" }));
    expect(await screen.findByText(/already has an account, so they have access now/)).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST")?.body).toMatchObject({ role: "representative", propertyIds: [] });
  });

  it("removes someone's access to a property after confirming", async () => {
    vi.stubGlobal("confirm", () => true);
    const calls = mockFetch((_url, method) => (method === "DELETE" ? [204, null] : [200, org()]));
    show(false);
    const row = (await screen.findByText("Pat Manager")).closest("li")!;
    expect(row).toHaveTextContent("Property manager at Demo Community");
    await userEvent.click(within(row).getByRole("button", { name: "Remove access" }));
    expect(calls.find((c) => c.method === "DELETE")?.url).toBe("/api/organizations/org1/properties/p1/members/user_pm");
    expect(await screen.findByText("Pat Manager can no longer see Demo Community.")).toBeInTheDocument();
  });

  it("adds a property to the organization", async () => {
    const calls = mockFetch((_url, method) => (method === "POST" ? [201, { property: { name: "Sage Pointe" } }] : [200, org()]));
    show(false);
    await userEvent.click(await screen.findByRole("button", { name: "Add a property" }));
    await userEvent.type(screen.getByLabelText("Property name"), "Sage Pointe");
    await userEvent.type(screen.getByLabelText(/^City/), "Lithonia");
    await userEvent.click(screen.getByRole("button", { name: "Add property" }));
    expect(await screen.findByText("Sage Pointe added.")).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST")).toMatchObject({
      url: "/api/organizations/org1/properties",
      body: { name: "Sage Pointe", city: "Lithonia" },
    });
  });

  it("links properties to the portal for representatives and to the admin page for admins", async () => {
    mockFetch(() => [200, org()]);
    show(false);
    expect(await screen.findByRole("link", { name: "Demo Community" })).toHaveAttribute("href", "/portal/properties/p1");
  });

  it("tells a representative to add a property before inviting managers", async () => {
    mockFetch(() => [200, org({ properties: [], staff: [], invitations: [] })]);
    show(false);
    await waitFor(() => expect(screen.getByText("Add a property first, then invite its managers.")).toBeInTheDocument());
  });
});
