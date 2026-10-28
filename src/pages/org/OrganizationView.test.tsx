import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockFetch, renderRoute } from "../../test/render";
import { orgDetail } from "../../test/fixtures";
import { OrganizationView } from "./OrganizationView";

const show = (isAdmin: boolean, url = "/org/org1", area: "admin" | "portal" = isAdmin ? "admin" : "portal") =>
  renderRoute("/org/:id", url, <OrganizationView id="org1" area={area} isAdmin={isAdmin} />, <Route path="properties/new" element={<p>Add property form</p>} />);

afterEach(() => vi.unstubAllGlobals());

describe("OrganizationView", () => {
  it("shows the organization with its numbers and property cards", async () => {
    mockFetch(() => [200, orgDetail()]);
    show(false);
    expect(await screen.findByRole("heading", { name: "Demo Management", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("Customer since Mar 2026")).toBeInTheDocument();
    expect(screen.getByText("2 of 100")).toBeInTheDocument();
    expect(screen.getByText("98 slots left")).toBeInTheDocument();
    expect(screen.getByText("Oldest 21 hours")).toBeInTheDocument();
    const card = screen.getByRole("link", { name: /Demo Community/ });
    expect(card).toHaveTextContent("Clarkston · 30 units · 36-month");
    expect(card).toHaveTextContent("2 open reports");
    expect(card).toHaveTextContent("Steward Dana B.");
    expect(screen.getByRole("link", { name: /Willow Bend/ })).toHaveTextContent("Starting Jan 4");
  });

  it("links properties to the portal for representatives and to the Admin Portal for admins", async () => {
    mockFetch(() => [200, orgDetail()]);
    const { unmount } = show(false);
    expect(await screen.findByRole("link", { name: /Demo Community/ })).toHaveAttribute("href", "/portal/properties/p1");
    unmount();
    show(true);
    expect(await screen.findByRole("link", { name: /Demo Community/ })).toHaveAttribute("href", "/admin/organizations/org1/properties/p1");
  });

  it("opens Add property over the page, and blocks it at the limit", async () => {
    mockFetch(() => [200, orgDetail()]);
    const { unmount } = show(false);
    await userEvent.click(await screen.findByRole("link", { name: /^Add property/ }));
    expect(screen.getByText("Add property form")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Demo Management", level: 1 })).toBeInTheDocument();
    unmount();

    mockFetch(() => [200, orgDetail({ organization: { ...orgDetail().organization, propertyLimit: 2 } })]);
    show(false);
    expect(await screen.findByRole("button", { name: "Add property" })).toBeDisabled();
    expect(screen.getByText(/has all 2 of its properties/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Add a property/ })).not.toBeInTheDocument();
  });

  it("invites a manager to the properties chosen", async () => {
    const calls = mockFetch((_url, method) => (method === "POST" ? [201, { status: "invited" }] : [200, orgDetail()]));
    show(false);
    await userEvent.click(await screen.findByRole("button", { name: "Invite people" }));
    const dialog = screen.getByRole("dialog", { name: "Invite people" });
    const role = within(dialog).getByLabelText("Role");
    // Only CBES invites representatives.
    expect(within(role).queryByRole("option", { name: "Representative" })).not.toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText("Email"), "sam@demo-mgmt.com");
    await userEvent.selectOptions(role, "director");
    await userEvent.click(within(dialog).getByRole("checkbox", { name: "Willow Bend" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Send invitation" }));
    expect(await screen.findByText(/Invitation sent to sam@demo-mgmt.com/)).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST")).toMatchObject({
      url: "/api/organizations/org1/invitations",
      body: { email: "sam@demo-mgmt.com", name: "", role: "director", propertyIds: ["p2"] },
    });
  });

  it("invites a representative to the whole organization", async () => {
    const calls = mockFetch((_url, method) => (method === "POST" ? [201, { status: "added" }] : [200, orgDetail()]));
    show(true);
    await userEvent.click(await screen.findByRole("button", { name: "Invite people" }));
    const dialog = screen.getByRole("dialog", { name: "Invite people" });
    expect(within(dialog).getByLabelText("Role")).toHaveValue("representative");
    expect(within(dialog).queryByRole("checkbox")).not.toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText("Email"), "pat@demo-mgmt.com");
    await userEvent.click(within(dialog).getByRole("button", { name: "Send invitation" }));
    expect(await screen.findByText(/already has an account, so they have access now/)).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST")?.body).toMatchObject({ role: "representative", propertyIds: [] });
  });

  it("keeps the tab in the address and lets only admins remove representatives", async () => {
    mockFetch(() => [200, orgDetail()]);
    show(false);
    await userEvent.click(await screen.findByRole("tab", { name: /People/ }));
    expect(screen.getByTestId("location")).toHaveTextContent("/org/org1?tab=people");
    const rep = screen.getByText("Riley Rep").closest("li")!;
    expect(within(rep).queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: /Invitations/ }));
    // A representative invitation can't be cancelled by a representative either.
    expect(screen.getByText("boss@demo-mgmt.com").closest("li")).not.toContainElement(screen.queryByRole("button", { name: "Cancel invitation" }));
  });

  it("removes someone's access to a property after confirming", async () => {
    const calls = mockFetch((_url, method) => (method === "DELETE" ? [204, null] : [200, orgDetail()]));
    show(false, "/org/org1?tab=people");
    const row = (await screen.findAllByText("Pat Manager")).map((el) => el.closest("li")!).find((li) => within(li).queryByRole("button"))!;
    expect(row).toHaveTextContent("Demo Community");
    await userEvent.click(within(row).getByRole("button", { name: "Remove access" }));
    const dialog = screen.getByRole("dialog", { name: "Remove access" });
    expect(dialog).toHaveTextContent("Remove Pat Manager's access to Demo Community?");
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
    await userEvent.click(within(dialog).getByRole("button", { name: "Remove" }));
    expect(await screen.findByText("Pat Manager can no longer see Demo Community.")).toBeInTheDocument();
    expect(calls.find((c) => c.method === "DELETE")?.url).toBe("/api/organizations/org1/properties/p1/members/user_pm");
  });

  it("lets admins edit the status; representatives only the name", async () => {
    const calls = mockFetch((_url, method) => (method === "PATCH" ? [200, { organization: orgDetail().organization }] : [200, orgDetail()]));
    const { unmount } = show(false);
    await userEvent.click(await screen.findByRole("button", { name: "Edit organization" }));
    expect(screen.queryByLabelText("Status")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ name: "Demo Management" }));
    unmount();

    calls.length = 0;
    show(true);
    await userEvent.click(await screen.findByRole("button", { name: "Edit organization" }));
    await userEvent.selectOptions(screen.getByLabelText("Status"), "inactive");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(calls.find((c) => c.method === "PATCH")?.body).toMatchObject({ status: "inactive", serviceArea: "Clarkston, Tucker" }));
  });
});
