import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdminPropertyDetail } from "../../lib/api";
import { mockFetch, renderRoute } from "../../test/render";
import { NewPropertyPage, PropertyAdminPage } from "./PropertyAdminPage";

const detail = (overrides: Partial<AdminPropertyDetail> = {}): AdminPropertyDetail => ({
  property: {
    id: "p1",
    name: "Demo Community",
    slug: "demo-community",
    address: "100 Demo Way",
    city: "Clarkston",
    county: "DeKalb",
    unitCount: 30,
    organizationId: "org1",
    organizationName: "Demo Management",
    serviceStartDate: null,
    contractType: "12_month",
    status: "active",
    connecteamJobId: "job-7",
  },
  members: [{ id: "user_pm", email: "pat@demo-mgmt.com", name: "Pat Manager", role: "manager" }],
  invitations: [],
  ...overrides,
});

const organizations = [
  { id: "org1", name: "Demo Management", properties: 1, representatives: 0, staff: 1, pendingInvitations: 0 },
  { id: "org2", name: "Elsewhere Living", properties: 0, representatives: 0, staff: 0, pendingInvitations: 0 },
];

afterEach(() => vi.unstubAllGlobals());

describe("PropertyAdminPage", () => {
  it("lists who can see the property and points to its organization for invitations", async () => {
    mockFetch((url) => (url === "/api/organizations" ? [200, { organizations }] : [200, detail()]));
    renderRoute("/admin/properties/:id", "/admin/properties/p1", <PropertyAdminPage />);
    expect(await screen.findByText("Pat Manager")).toBeInTheDocument();
    for (const link of screen.getAllByRole("link", { name: "Demo Management" })) expect(link).toHaveAttribute("href", "/admin/organizations/org1");
    expect(screen.queryByRole("button", { name: "Send invitation" })).not.toBeInTheDocument();
  });

  it("asks for an organization before anyone can be invited", async () => {
    const unassigned = detail();
    unassigned.property = { ...unassigned.property, organizationId: null, organizationName: null };
    mockFetch((url) => (url === "/api/organizations" ? [200, { organizations }] : [200, unassigned]));
    renderRoute("/admin/properties/:id", "/admin/properties/p1", <PropertyAdminPage />);
    expect(await screen.findByText(/Assign an organization/)).toBeInTheDocument();
  });

  it("moves the property to another organization", async () => {
    const calls = mockFetch((url, method) =>
      url === "/api/organizations" ? [200, { organizations }] : method === "PATCH" ? [200, { property: detail().property }] : [200, detail()],
    );
    renderRoute("/admin/properties/:id", "/admin/properties/p1", <PropertyAdminPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
    const select = screen.getByLabelText(/^Organization/);
    await waitFor(() => expect(select).toHaveValue("org1"));
    await userEvent.selectOptions(select, "org2");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Property saved.")).toBeInTheDocument();
    expect(calls.find((c) => c.method === "PATCH")?.body).toMatchObject({ organizationId: "org2" });
  });

  it("edits the Connecteam job", async () => {
    const calls = mockFetch((url, method) =>
      url === "/api/organizations" ? [200, { organizations }] : method === "PATCH" ? [200, { property: detail().property }] : [200, detail()],
    );
    renderRoute("/admin/properties/:id", "/admin/properties/p1", <PropertyAdminPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
    const job = screen.getByLabelText(/Connecteam job ID/);
    await userEvent.clear(job);
    await userEvent.type(job, "job-12");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Property saved.")).toBeInTheDocument();
    expect(calls.find((c) => c.method === "PATCH")?.body).toMatchObject({ name: "Demo Community", connecteamJobId: "job-12", unitCount: "30" });
  });
});

describe("NewPropertyPage", () => {
  it("creates the property and opens it", async () => {
    const calls = mockFetch((url) => (url === "/api/organizations" ? [200, { organizations }] : [201, { property: { ...detail().property, id: "p9" } }]));
    renderRoute("/admin/properties/new", "/admin/properties/new", <NewPropertyPage />);
    await userEvent.type(screen.getByLabelText("Property name"), "Sage Pointe");
    await userEvent.click(screen.getByRole("button", { name: "Add property" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/admin/properties/p9"));
    expect(calls.find((c) => c.method === "POST")).toMatchObject({ url: "/api/admin/properties", body: { name: "Sage Pointe" } });
  });
});
