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
  row({ id: "u_admin", name: "Nigel Crawford", email: "nigel@cbenvironments.com", role: "admin", access: "Everything" }),
  row({ id: "u_lead", name: "Dana Brooks", email: "dana@cbenvironments.com", role: "lead", access: "4 properties", mfa: "authenticator" }),
  row({ id: "u_rep", name: "Lauren Kim", email: "lauren@peachtreeres.com", role: "representative", access: "Peachtree Residential (6)", orgId: "org1" }),
  row({ id: null, invitationId: "org:i1", name: null, email: "m.ortega@peachtreeres.com", role: "manager", access: "Clarkston Commons", mfa: "none", status: "invited", invitedAt: "2026-10-18T12:00:00Z" }),
];
const list = { items: users, total: users.length, page: 1, pageSize: 50, groupCounts: { all: 5, cbes: 3, orgs: 2, invited: 1 } };

function handler(url: string, method: string): [number, unknown] {
  if (url.startsWith("/api/admin/users?")) return [200, list];
  if (url === "/api/admin/users/role-counts") return [200, { super_admin: 1, admin: 1, lead: 2, valet: 9, representative: 9, director: 5, manager: 4 }];
  if (url === "/api/admin/users/u_lead/access" && method === "DELETE") return [204, null];
  if (url === "/api/admin/staff-invitations") return [201, { status: "invited" }];
  if (url === "/api/admin/properties") return [200, { properties: [{ id: "p1", name: "The Oaks at Decatur", city: "Decatur", status: "active" }] }];
  if (url === "/api/auth/mfa/status") return [200, { passkey: true, authenticator: false, verified: true, pending: false }];
  if (url === "/api/auth/step-up/options") return [200, { options: { challenge: "c" }, challengeId: "ch1" }];
  if (url === "/api/auth/step-up/verify") return [200, { stepUpToken: "tok", expiresAt: "" }];
  if (url === "/api/admin/admins/upgrade") return [200, { user: users[2] }];
  if (url === "/api/admin/admins/invite") return [201, { status: "invited" }];
  return [404, { error: "Not found" }];
}

const show = (url = "/admin/users") => renderRoute("/admin/users", url, <UsersPage />, <Route path="add-admin" element={<AddAdminModal />} />);
const asRole = (role: string) => ((globalThis as { __clerkRole?: string }).__clerkRole = role);

beforeEach(() => {
  const clerk = fakeClerk();
  clerk.session = fakeSession();
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete (globalThis as { __clerkRole?: string }).__clerkRole;
});

describe("UsersPage", () => {
  it("lets an Admin add a scoped role without exposing Admin or Super Admin choices", async () => {
    asRole("admin");
    const calls = mockFetch((url, method) => {
      if (url === "/api/organizations") return [200, { organizations: [{ id: "org1", name: "Peachtree Residential", status: "active" }] }];
      if (url === "/api/admin/properties") return [200, { properties: [
        { id: "p1", name: "The Oaks", organizationId: "org1", status: "active" },
        { id: "p2", name: "Elsewhere", organizationId: "org2", status: "active" },
      ] }];
      if (url === "/api/admin/users/u_rep/roles") return [200, {}];
      return handler(url, method);
    });
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Add role for Lauren Kim" }));
    const dialog = screen.getByRole("dialog", { name: "Add role" });
    const select = within(dialog).getByLabelText("Role to add");
    expect(within(select).queryByRole("option", { name: "Admin" })).not.toBeInTheDocument();
    expect(within(select).queryByRole("option", { name: "Super Admin" })).not.toBeInTheDocument();
    await userEvent.selectOptions(select, "director");
    expect(await within(dialog).findByRole("option", { name: "Peachtree Residential" })).toBeInTheDocument();
    const submit = within(dialog).getByRole("button", { name: "Add role" });
    expect(submit).toBeDisabled();
    await userEvent.click(await within(dialog).findByRole("checkbox", { name: "The Oaks" }));
    expect(within(dialog).queryByRole("checkbox", { name: "Elsewhere" })).not.toBeInTheDocument();
    await userEvent.click(submit);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(calls.find((c) => c.url === "/api/admin/users/u_rep/roles")).toMatchObject({ method: "POST", body: { role: "director", organizationId: "org1", propertyIds: ["p1"] } });
    expect(calls.some((c) => c.url.includes("/step-up/"))).toBe(false);
  });

  it("lets a Super Admin grant Super Admin after confirming its access and a passkey", async () => {
    asRole("super_admin");
    const calls = mockFetch((url, method) => url === "/api/admin/users/u_admin/roles" ? [200, {}] : handler(url, method));
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Add role for Nigel Crawford" }));
    const dialog = screen.getByRole("dialog", { name: "Add role" });
    await userEvent.selectOptions(within(dialog).getByLabelText("Role to add"), "super_admin");
    const submit = within(dialog).getByRole("button", { name: "Confirm and add role" });
    expect(submit).toBeDisabled();
    await userEvent.click(within(dialog).getByRole("checkbox", { name: /I understand Nigel Crawford/ }));
    await userEvent.click(submit);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(calls.find((c) => c.url === "/api/admin/users/u_admin/roles")).toMatchObject({ method: "POST", body: { role: "super_admin", propertyIds: [], stepUpToken: "tok" } });
  });

  it("offers operational roles for a field account without switching them to an organization account", async () => {
    asRole("admin");
    mockFetch(handler);
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Add role for Dana Brooks" }));
    const select = within(screen.getByRole("dialog", { name: "Add role" })).getByLabelText("Role to add");
    expect(within(select).getAllByRole("option").map((option) => option.textContent)).toEqual(["Choose a role", "Steward", "Valet"]);
  });

  it("shows held roles together and keeps failed additions open", async () => {
    asRole("super_admin");
    mockFetch((url, method) => {
      if (url.startsWith("/api/admin/users?")) return [200, { ...list, items: [{ ...users[1], roles: ["admin", "lead", "representative"] }] }];
      if (url === "/api/admin/users/u_admin/roles") return [403, { error: "Role assignment unavailable" }];
      return handler(url, method);
    });
    show();
    const person = (await screen.findByText("Nigel Crawford")).closest("tr")!;
    expect(within(person).getByText("Admin")).toBeInTheDocument();
    expect(within(person).getByText("Steward")).toBeInTheDocument();
    expect(within(person).getByText("Representative")).toBeInTheDocument();
    const trigger = within(person).getByRole("button", { name: "Add role for Nigel Crawford" });
    await userEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Add role" });
    await userEvent.selectOptions(within(dialog).getByLabelText("Role to add"), "lead");
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Add role" })).toBeEnabled());
    await userEvent.click(within(dialog).getByRole("button", { name: "Add role" }));
    expect(await within(dialog).findByText("Role assignment unavailable")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(trigger).toHaveFocus();
  });

  it.each(["representative", "director", "manager", "lead", "valet"])("hides role assignment controls from %s", async (role) => {
    asRole(role);
    mockFetch(handler);
    show();
    await screen.findByText("Dana Brooks");
    expect(screen.queryByRole("button", { name: /^Add role for/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Actions for Dana Brooks" }));
    expect(screen.queryByRole("menuitem", { name: "Add role" })).not.toBeInTheDocument();
  });

  it("lists everyone with their role, access and two-step, and filters by role chip", async () => {
    asRole("admin");
    const calls = mockFetch(handler);
    show();
    const dana = (await screen.findByText("Dana Brooks")).closest("tr")!;
    expect(dana).toHaveTextContent("Steward");
    expect(dana).toHaveTextContent("4 properties");
    expect(dana).toHaveTextContent("Authenticator");
    expect((screen.getByText("m.ortega@peachtreeres.com")).closest("tr")).toHaveTextContent("Not set up");
    await userEvent.click(screen.getByRole("button", { name: /Valets/ }));
    expect(screen.getByTestId("location")).toHaveTextContent("role=valet");
    await waitFor(() => expect(calls.some((c) => c.url.includes("role=valet"))).toBe(true));
  });

  it("hides adding and upgrading admins from admins", async () => {
    asRole("admin");
    mockFetch(handler);
    show();
    await screen.findByText("Dana Brooks");
    expect(screen.queryByRole("link", { name: /Add admin/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Actions for Dana Brooks" }));
    expect(screen.queryByRole("menuitem", { name: "Upgrade to Admin" })).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "Actions for Nigel Crawford" }));
    expect(screen.getByRole("menuitem", { name: "Remove access" })).toHaveAttribute("aria-disabled", "true");
  });

  it("removes a Steward's access after confirming", async () => {
    asRole("admin");
    const calls = mockFetch(handler);
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Actions for Dana Brooks" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Remove access" }));
    const dialog = screen.getByRole("dialog", { name: "Remove access" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Remove access" }));
    expect(await screen.findByText("Dana Brooks can no longer sign in to the portal.")).toBeInTheDocument();
    expect(calls.find((c) => c.method === "DELETE")?.url).toBe("/api/admin/users/u_lead/access");
  });

  it("cancels a role change without writing, then saves and restores focus to the row", async () => {
    asRole("admin");
    const calls = mockFetch((url, method) => url === "/api/admin/users/u_lead" && method === "PATCH" ? [200, {}] : handler(url, method));
    show();
    const trigger = await screen.findByRole("button", { name: "Actions for Dana Brooks" });
    await userEvent.click(trigger);
    expect(screen.getByRole("table", { name: "Users" })).not.toContainElement(screen.getByRole("menu"));
    await userEvent.click(screen.getByRole("menuitem", { name: "Change role" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await userEvent.click(within(screen.getByRole("dialog", { name: "Change role" })).getByRole("button", { name: "Cancel" }));
    expect(trigger).toHaveFocus();
    expect(calls.some((c) => c.method === "PATCH")).toBe(false);
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("menuitem", { name: "Change role" }));
    await userEvent.click(within(screen.getByRole("dialog", { name: "Change role" })).getByRole("button", { name: "Make Valet" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(calls.find((c) => c.method === "PATCH")).toMatchObject({ url: "/api/admin/users/u_lead", body: { role: "valet" } });
    expect(trigger).toHaveFocus();
  });

  it("keeps a failed role change open with its error and permits cancellation", async () => {
    asRole("admin");
    mockFetch((url, method) => url === "/api/admin/users/u_lead" && method === "PATCH" ? [400, { error: "Role change unavailable" }] : handler(url, method));
    show();
    const trigger = await screen.findByRole("button", { name: "Actions for Dana Brooks" });
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("menuitem", { name: "Change role" }));
    const dialog = screen.getByRole("dialog", { name: "Change role" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Make Valet" }));
    expect(await within(dialog).findByText("Role change unavailable")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
  });

  it("opens activity for the selected user and restores focus when the drawer closes", async () => {
    asRole("admin");
    const calls = mockFetch((url, method) => url.startsWith("/api/admin/audit?") ? [200, { items: [] }] : handler(url, method));
    show();
    const trigger = await screen.findByRole("button", { name: "Actions for Dana Brooks" });
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("menuitem", { name: "View activity" }));
    const dialog = screen.getByRole("dialog", { name: "Activity" });
    expect(dialog).toHaveTextContent("Dana Brooks");
    expect(await within(dialog).findByText("No changes recorded for this person yet.")).toBeInTheDocument();
    expect(calls.some((c) => c.url === "/api/admin/audit?targetType=user&targetId=u_lead")).toBe(true);
    await userEvent.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
  });

  it.each([
    ["Resend invitation", "/api/admin/invitations/org:i1/resend", "POST"],
    ["Cancel invitation", "/api/admin/invitations/org:i1", "DELETE"],
  ])("runs %s for the selected invitation", async (label, path, method) => {
    asRole("admin");
    const calls = mockFetch((url, verb) => url === path ? [204, null] : handler(url, verb));
    show();
    const trigger = await screen.findByRole("button", { name: "Actions for m.ortega@peachtreeres.com" });
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("menuitem", { name: label }));
    await waitFor(() => expect(calls.some((c) => c.url === path && c.method === method)).toBe(true));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it.each([false, true])("handles MFA reset (failure=%s) and blocks protected admin actions", async (fail) => {
    asRole("admin");
    const calls = mockFetch((url, method) => url.endsWith("/reset-mfa") ? fail ? [400, { error: "Reset unavailable" }] : [204, null] : handler(url, method));
    show();
    const trigger = await screen.findByRole("button", { name: "Actions for Dana Brooks" });
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("menuitem", { name: "Reset two-step verification" }));
    expect(await screen.findByText(fail ? "Reset unavailable" : /Dana Brooks will set up two-step verification again/)).toBeInTheDocument();
    expect(calls.find((c) => c.url.endsWith("/reset-mfa"))).toMatchObject({ url: "/api/admin/users/u_lead/reset-mfa", method: "POST" });
    await userEvent.click(screen.getByRole("button", { name: "Actions for Nigel Crawford" }));
    const protectedAction = screen.getByRole("menuitem", { name: "Reset two-step verification" });
    expect(protectedAction).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(protectedAction);
    expect(calls.filter((c) => c.url.endsWith("/reset-mfa"))).toHaveLength(1);
  });

  it("keeps the Steward role alongside Admin, and the Super Admin can remove it", async () => {
    asRole("super_admin");
    const steward = row({ id: "u_admin2", name: "Andre Lewis", email: "andre@cbenvironments.com", role: "admin", access: "Everything", steward: true });
    const calls = mockFetch((url, method) =>
      url.startsWith("/api/admin/users?") ? [200, { ...list, items: [...users, steward] }] : url === "/api/admin/users/u_admin2/steward" ? [200, { user: { ...steward, steward: false } }] : handler(url, method),
    );
    show();
    const r = (await screen.findByText("Andre Lewis")).closest("tr")!;
    expect(within(r).getByText("Admin")).toBeInTheDocument();
    expect(within(r).getByText("Steward")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Actions for Andre Lewis" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Remove Steward role" }));
    await waitFor(() => expect(calls.find((c) => c.method === "PUT")).toMatchObject({ url: "/api/admin/users/u_admin2/steward", body: { steward: false } }));
  });

  it("offers the Super Admin removing admin from an admin who is also a Steward", async () => {
    asRole("super_admin");
    const steward = row({ id: "u_admin2", name: "Andre Lewis", email: "andre@cbenvironments.com", role: "admin", access: "Everything", steward: true });
    mockFetch((url, method) => (url.startsWith("/api/admin/users?") ? [200, { ...list, items: [...users, steward] }] : handler(url, method)));
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Actions for Andre Lewis" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Remove admin access" }));
    const dialog = screen.getByRole("dialog", { name: "Remove admin access" });
    expect(dialog).toHaveTextContent("They stay the Steward on the properties they lead");
    expect(await within(dialog).findByRole("button", { name: "Confirm with passkey and remove" })).toBeEnabled();
  });

  it("turns a removed account back on", async () => {
    asRole("admin");
    const calls = mockFetch((url, method) =>
      url.startsWith("/api/admin/users?") ? [200, { ...list, items: [row({ id: "u_gone", name: "Jorge Ramos", status: "removed" })] }] : url.endsWith("/restore") ? [204, null] : handler(url, method),
    );
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Actions for Jorge Ramos" }));
    expect(screen.queryByRole("menuitem", { name: "Remove access" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("menuitem", { name: "Restore account" }));
    await waitFor(() => expect(calls.find((c) => c.url.endsWith("/restore"))?.method).toBe("POST"));
  });

  it("invites a valet to properties", async () => {
    asRole("admin");
    const calls = mockFetch(handler);
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Invite CBES staff" }));
    const dialog = screen.getByRole("dialog", { name: "Invite CBES staff" });
    await userEvent.type(within(dialog).getByLabelText("Email"), "tasha@cbenvironments.com");
    await userEvent.click(await within(dialog).findByRole("checkbox", { name: /The Oaks at Decatur/ }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Send invitation" }));
    expect(await screen.findByText("Invitation sent to tasha@cbenvironments.com.")).toBeInTheDocument();
    expect(calls.find((c) => c.url === "/api/admin/staff-invitations")?.body).toEqual({ email: "tasha@cbenvironments.com", role: "valet", propertyIds: ["p1"] });
  });
});

describe("AddAdminModal", () => {
  it("sends admins back to the users list", async () => {
    asRole("admin");
    mockFetch(handler);
    show("/admin/users/add-admin");
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent(/^\/admin\/users$/));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("upgrades a Steward after the Super Admin confirms with a passkey", async () => {
    asRole("super_admin");
    const calls = mockFetch(handler);
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Actions for Dana Brooks" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Upgrade to Admin" }));
    const dialog = await screen.findByRole("dialog", { name: "Add an admin" });
    expect(within(dialog).getByRole("tab", { name: "Upgrade an existing user" })).toHaveAttribute("aria-selected", "true");
    expect(await within(dialog).findByText("dana@cbenvironments.com · Authenticator on")).toBeInTheDocument();
    const confirm = within(dialog).getByRole("button", { name: /Confirm with passkey and upgrade/ });
    expect(confirm).toBeDisabled();
    await userEvent.click(within(dialog).getByRole("checkbox", { name: /Dana will see every organization.*keeps Steward duties/ }));
    await userEvent.click(confirm);
    expect(await screen.findByText("Dana Brooks is now an admin.")).toBeInTheDocument();
    expect(calls.find((c) => c.url === "/api/auth/step-up/verify")?.body).toEqual({ challengeId: "ch1", credential: { id: "cred", type: "public-key" } });
    expect(calls.find((c) => c.url === "/api/admin/admins/upgrade")?.body).toEqual({ userId: "u_lead", stepUpToken: "tok" });
  });

  it("invites a new admin", async () => {
    asRole("super_admin");
    const calls = mockFetch(handler);
    show("/admin/users/add-admin");
    const dialog = await screen.findByRole("dialog", { name: "Add an admin" });
    await userEvent.type(within(dialog).getByLabelText("Email"), "sam@cbenvironments.com");
    await userEvent.click(within(dialog).getByRole("checkbox", { name: /I understand/ }));
    await userEvent.click(await within(dialog).findByRole("button", { name: /Confirm with passkey and send invite/ }));
    await waitFor(() => expect(calls.find((c) => c.url === "/api/admin/admins/invite")?.body).toEqual({ email: "sam@cbenvironments.com", stepUpToken: "tok" }));
  });
});
