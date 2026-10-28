import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockFetch, renderRoute } from "../../test/render";
import { orgRow } from "../../test/fixtures";
import { OrganizationsPage } from "./OrganizationsPage";

const summary = { organizations: 2, properties: 3, units: 4812, representatives: 1, pendingInvitations: 4 };
const orgs = [orgRow(), orgRow({ id: "org2", name: "Oakline Properties", status: "onboarding", properties: 1, units: 644, representatives: [], pendingInvitations: 1, avgReplyHours: null })];

const handler = (url: string, method: string): [number, unknown] => {
  if (url === "/api/organizations" && method === "GET") return [200, { organizations: orgs }];
  if (url === "/api/admin/organizations/summary") return [200, summary];
  if (url === "/api/admin/properties") return [200, { properties: [] }];
  if (url === "/api/organizations" && method === "POST") return [201, { organization: { id: "org9", name: "Cedar Grove Partners" } }];
  if (url === "/api/organizations/org9/invitations") return [201, { status: "invited" }];
  return [404, { error: "Not found" }];
};

const show = (url = "/admin/organizations") => renderRoute("/admin/organizations", url, <OrganizationsPage />);

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("OrganizationsPage", () => {
  it("shows the totals and active organizations as tiles", async () => {
    mockFetch(handler);
    show();
    expect(await screen.findByText("4,812")).toBeInTheDocument();
    const tile = await screen.findByRole("link", { name: /Demo Management/ });
    expect(tile).toHaveTextContent("2 of 100 properties");
    expect(tile).toHaveTextContent("1,752 units");
    expect(tile).toHaveTextContent("4.9h");
    expect(tile).toHaveTextContent("Riley Rep");
    // Onboarding organizations are under Status: Onboarding or All.
    expect(screen.queryByRole("link", { name: /Oakline Properties/ })).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Status"), "all");
    expect(screen.getByRole("link", { name: /Oakline Properties/ })).toHaveTextContent("Invite pending");
    expect(screen.getByTestId("location")).toHaveTextContent("status=all");
  });

  it("switches to the list and remembers it", async () => {
    mockFetch(handler);
    const { unmount } = show();
    await userEvent.click(await screen.findByRole("button", { name: "List" }));
    expect(screen.getByRole("table", { name: "Organizations" })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("view=list");
    unmount();
    show();
    expect(await screen.findByRole("table", { name: "Organizations" })).toBeInTheDocument();
  });

  it("searches names and Representatives", async () => {
    mockFetch(handler);
    show("/admin/organizations?status=all");
    await userEvent.type(await screen.findByRole("searchbox", { name: "Search organizations" }), "riley");
    expect(screen.getByRole("link", { name: /Demo Management/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Oakline/ })).not.toBeInTheDocument();
  });

  it("adds an organization and invites its Representative", async () => {
    const calls = mockFetch(handler);
    show();
    await userEvent.click(await screen.findByRole("button", { name: "New organization" }));
    const dialog = screen.getByRole("dialog", { name: "New organization" });
    await userEvent.type(within(dialog).getByLabelText("Organization name"), "Cedar Grove Partners");
    await userEvent.type(within(dialog).getByLabelText(/^Email/), "tara@cedargrove.com");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add organization" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/admin/organizations/org9"));
    expect(calls.find((c) => c.method === "POST" && c.url === "/api/organizations")?.body).toEqual({ name: "Cedar Grove Partners", serviceArea: "", status: "onboarding" });
    expect(calls.find((c) => c.url === "/api/organizations/org9/invitations")?.body).toMatchObject({ email: "tara@cedargrove.com", role: "representative", propertyIds: [] });
  });

  it("lists properties that still need an organization", async () => {
    mockFetch((url, method) =>
      url === "/api/admin/properties" ? [200, { properties: [{ id: "p7", name: "Old Mill", city: "Tucker", organizationId: null }] }] : handler(url, method),
    );
    show("/admin/organizations?unassigned=1");
    expect(await screen.findByRole("heading", { name: "1 property isn't in an organization yet" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Move Old Mill/ })).toHaveAttribute("href", "/admin/organizations/unassigned/properties/p7?tab=settings");
  });
});
