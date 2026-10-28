import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminUserRow } from "../../lib/api";
import { fakeClerk, fakeSession } from "../../test/clerk";
import { mockFetch, renderRoute } from "../../test/render";
import { UsersPage } from "./UsersPage";
import { AddAdminModal } from "./AddAdminModal";

vi.mock("@simplewebauthn/browser", () => ({ startAuthentication: vi.fn(async () => ({ id: "cred", type: "public-key" })) }));
const row = (o: Partial<AdminUserRow>): AdminUserRow => ({ id: "u", invitationId: null, name: "Someone", email: "s@x.com", role: "valet", access: "Not assigned yet", orgId: null, mfa: "passkey", lastActiveAt: null, status: "active", invitedAt: null, ...o });
const users = [
  row({ id: "u_super", name: "Nick Crawford", email: "nick@cbenvironments.com", role: "super_admin", access: "Everything" }),
  row({ id: "u_admin", name: "Nigel Crawford", role: "admin", access: "Everything" }),
  row({ id: "u_lead", name: "Dana Brooks", role: "lead", access: "The Oaks" }),
  row({ id: "u_rep", name: "Lauren Kim", role: "representative", orgId: "org1" }),
  row({ id: null, invitationId: "org:i1", name: null, email: "invited@example.com", role: "manager", status: "invited" }),
];
const list = { items: users, total: users.length, page: 1, pageSize: 50, groupCounts: { all: 5, cbes: 3, orgs: 2, invited: 1 } };
function handler(url: string, method: string): [number, unknown] {
  if (url.startsWith("/api/admin/users?")) return [200, list];
  if (url === "/api/admin/users/role-counts") return [200, { super_admin: 1, admin: 1, lead: 1, valet: 0, representative: 1, manager: 0 }];
  if (url.endsWith("/role")) return [200, { organizationId: "org1", propertyIds: ["p1"] }];
  if (url === "/api/organizations") return [200, { organizations: [{ id: "org1", name: "Peachtree", status: "active" }] }];
  if (url === "/api/admin/properties") return [200, { properties: [
    { id: "p1", name: "The Oaks", organizationId: "org1", status: "active" },
    { id: "p2", name: "Elsewhere", organizationId: "org2", status: "active" },
  ] }];
  if (url === "/api/auth/mfa/status") return [200, { passkey: true, authenticator: false, verified: true, pending: false }];
  if (url === "/api/auth/step-up/options") return [200, { options: { challenge: "c" }, challengeId: "ch1" }];
  if (url === "/api/auth/step-up/verify") return [200, { stepUpToken: "tok" }];
  if (url.startsWith("/api/admin/users/") && method === "PATCH") return [200, {}];
  if (url === "/api/admin/admins/invite" || url === "/api/admin/staff-invitations") return [201, { status: "invited" }];
  if (url.includes("/access") || url.includes("/invitations/") || url.endsWith("/reset-mfa") || url.endsWith("/restore")) return [204, null];
  if (url.startsWith("/api/admin/audit?")) return [200, { items: [] }];
  return [404, { error: "Not found" }];
}
const show = (url = "/admin/users") => renderRoute("/admin/users", url, <UsersPage />, <Route path="add-admin" element={<AddAdminModal />} />);
const asRole = (role: string) => ((globalThis as { __clerkRole?: string }).__clerkRole = role);
async function edit(name: string) {
  await userEvent.click(await screen.findByRole("button", { name: `Actions for ${name}` }));
  await userEvent.click(screen.getByRole("menuitem", { name: "Change Role" }));
  return screen.getByRole("dialog", { name: "Change Role" });
}
beforeEach(() => { fakeClerk().session = fakeSession(); });
afterEach(() => { vi.unstubAllGlobals(); delete (globalThis as { __clerkRole?: string }).__clerkRole; });

describe("Users roles", () => {
  it("shows one role per user and replaces the additive actions with Change Role", async () => {
    asRole("super_admin");
    mockFetch(handler);
    show();
    await screen.findByText("Dana Brooks");
    expect(screen.queryByRole("button", { name: /Add role/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Management Director/)).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Rep" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Property Manager" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Actions for Nigel Crawford" }));
    expect(screen.getByRole("menuitem", { name: "Change Role" })).toBeInTheDocument();
    for (const name of ["Add role", "Make Steward", "Upgrade to Admin", "Remove Steward role", "Remove admin access"]) expect(screen.queryByRole("menuitem", { name })).not.toBeInTheDocument();
  });

  it("replaces Rep with Property Manager on the selected properties", async () => {
    asRole("admin");
    const calls = mockFetch(handler);
    show();
    const dialog = await edit("Lauren Kim");
    const select = within(dialog).getByLabelText("Role");
    expect(select).toHaveValue("representative");
    expect(within(select).queryByRole("option", { name: "Admin" })).not.toBeInTheDocument();
    expect(within(select).queryByRole("option", { name: "Super Admin" })).not.toBeInTheDocument();
    expect(within(select).queryByRole("option", { name: /Director/ })).not.toBeInTheDocument();
    await userEvent.selectOptions(select, "manager");
    const submit = within(dialog).getByRole("button", { name: "Change Role" });
    expect(submit).toBeDisabled();
    await userEvent.click(await within(dialog).findByRole("checkbox", { name: "The Oaks" }));
    expect(within(dialog).queryByRole("checkbox", { name: "Elsewhere" })).not.toBeInTheDocument();
    await userEvent.click(submit);
    expect(await screen.findByText("Lauren Kim is now Property Manager.")).toBeInTheDocument();
    expect(calls.find((c) => c.method === "PATCH")).toMatchObject({ url: "/api/admin/users/u_rep", body: { role: "manager", organizationId: "org1", propertyIds: ["p1"] } });
    expect(calls.some((c) => c.url.includes("/step-up/"))).toBe(false);
  });

  it("preserves selected field properties when changing Steward to Valet", async () => {
    asRole("admin");
    const calls = mockFetch(handler);
    show();
    const dialog = await edit("Dana Brooks");
    expect(within(dialog).getByRole("button", { name: "Change Role" })).toBeDisabled();
    await userEvent.selectOptions(within(dialog).getByLabelText("Role"), "valet");
    await waitFor(() => expect(within(dialog).getByRole("checkbox", { name: "The Oaks" })).toBeChecked());
    await userEvent.click(within(dialog).getByRole("button", { name: "Change Role" }));
    expect(await screen.findByText("Dana Brooks is now Valet.")).toBeInTheDocument();
    expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ role: "valet", propertyIds: ["p1"] });
  });

  it.each(["admin", "super_admin"])("requires confirmation and a passkey to change a user to %s", async (role) => {
    asRole("super_admin");
    const calls = mockFetch(handler);
    show();
    const dialog = await edit("Dana Brooks");
    await userEvent.selectOptions(within(dialog).getByLabelText("Role"), role);
    const submit = within(dialog).getByRole("button", { name: "Confirm and change role" });
    expect(submit).toBeDisabled();
    await userEvent.click(within(dialog).getByRole("checkbox", { name: /I understand this replaces/ }));
    await userEvent.click(submit);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ role, propertyIds: [], stepUpToken: "tok" });
  });

  it("also requires verification when removing admin access", async () => {
    asRole("super_admin");
    const calls = mockFetch(handler);
    show();
    const dialog = await edit("Nigel Crawford");
    await userEvent.selectOptions(within(dialog).getByLabelText("Role"), "lead");
    await userEvent.click(within(dialog).getByRole("checkbox", { name: /I understand this replaces/ }));
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Confirm and change role" })).toBeEnabled());
    await userEvent.click(within(dialog).getByRole("button", { name: "Confirm and change role" }));
    await waitFor(() => expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ role: "lead", propertyIds: [], stepUpToken: "tok" }));
  });

  it("keeps failed changes open and restores focus when cancelled", async () => {
    asRole("admin");
    const calls = mockFetch((url, method) => method === "PATCH" ? [422, { error: "Role change unavailable" }] : handler(url, method));
    show();
    const dialog = await edit("Dana Brooks");
    await userEvent.selectOptions(within(dialog).getByLabelText("Role"), "valet");
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Change Role" })).toBeEnabled());
    await userEvent.click(within(dialog).getByRole("button", { name: "Change Role" }));
    expect(await within(dialog).findByText("Role change unavailable")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Actions for Dana Brooks" })).toHaveFocus();
    expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(1);
  });

  it("cancels without saving", async () => {
    asRole("admin");
    const calls = mockFetch(handler);
    show();
    const dialog = await edit("Dana Brooks");
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(calls.some((c) => c.method === "PATCH")).toBe(false);
  });

  it("hides changing other admins from Admins", async () => {
    asRole("admin");
    mockFetch(handler);
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Actions for Nigel Crawford" }));
    expect(screen.queryByRole("menuitem", { name: "Change Role" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Invite admin" })).not.toBeInTheDocument();
  });

  it.each(["representative", "manager", "lead", "valet"])("does not expose Change Role to %s", async (role) => {
    asRole(role);
    mockFetch(handler);
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Actions for Dana Brooks" }));
    expect(screen.queryByRole("menuitem", { name: "Change Role" })).not.toBeInTheDocument();
  });

  it("invites new staff with the role selected during creation", async () => {
    asRole("admin");
    const calls = mockFetch(handler);
    show();
    await userEvent.click(screen.getByRole("button", { name: "Invite CBES staff" }));
    const dialog = screen.getByRole("dialog", { name: "Invite CBES staff" });
    await userEvent.type(within(dialog).getByLabelText("Email"), "tasha@example.com");
    await userEvent.selectOptions(within(dialog).getByLabelText("Role"), "lead");
    await userEvent.click(await within(dialog).findByRole("checkbox", { name: /The Oaks/ }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Send invitation" }));
    await waitFor(() => expect(calls.find((c) => c.url === "/api/admin/staff-invitations")?.body).toEqual({ email: "tasha@example.com", role: "lead", propertyIds: ["p1"] }));
  });

  it("invites new admins without an existing-user upgrade flow", async () => {
    asRole("super_admin");
    const calls = mockFetch(handler);
    show("/admin/users/add-admin");
    const dialog = await screen.findByRole("dialog", { name: "Invite admin" });
    expect(within(dialog).queryByRole("tab")).not.toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText("Email"), "sam@example.com");
    await userEvent.click(within(dialog).getByRole("checkbox", { name: /I understand/ }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Confirm and send invitation" }));
    await waitFor(() => expect(calls.find((c) => c.url === "/api/admin/admins/invite")?.body).toEqual({ email: "sam@example.com", stepUpToken: "tok" }));
  });

  it("removes access and displays user activity", async () => {
    asRole("admin");
    const calls = mockFetch(handler);
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Actions for Dana Brooks" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "View activity" }));
    expect(await screen.findByText("No changes recorded for this person yet.")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "Actions for Dana Brooks" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Remove access" }));
    await userEvent.click(within(screen.getByRole("dialog", { name: "Remove access" })).getByRole("button", { name: "Remove access" }));
    await waitFor(() => expect(calls.some((c) => c.url === "/api/admin/users/u_lead/access" && c.method === "DELETE")).toBe(true));
  });
});
