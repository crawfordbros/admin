import { screen, waitFor, within } from "@testing-library/react";
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
    managementCompany: null,
    serviceStartDate: null,
    contractType: "12_month",
    status: "active",
    connecteamJobId: "job-7",
  },
  members: [{ id: "user_pm", email: "pat@demo-mgmt.com", name: "Pat Manager", role: "manager" }],
  invitations: [],
  ...overrides,
});

afterEach(() => vi.unstubAllGlobals());

describe("PropertyAdminPage", () => {
  it("invites a manager and shows the invitation", async () => {
    let invited = false;
    const calls = mockFetch((_url, method) => {
      if (method === "POST") {
        invited = true;
        return [201, { status: "invited" }];
      }
      return [
        200,
        detail(
          invited ? { invitations: [{ id: "i1", email: "sam@demo-mgmt.com", name: "Sam", role: "director", createdAt: "2026-10-27T12:00:00Z" }] } : {},
        ),
      ];
    });
    renderRoute("/admin/properties/:id", "/admin/properties/p1", <PropertyAdminPage />);

    await userEvent.type(await screen.findByLabelText("Email"), "sam@demo-mgmt.com");
    await userEvent.type(screen.getByLabelText(/^Name/), "Sam");
    await userEvent.selectOptions(screen.getByLabelText("Role"), "director");
    await userEvent.click(screen.getByRole("button", { name: "Send invitation" }));

    expect(await screen.findByText(/Invitation sent to sam@demo-mgmt.com/)).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST")).toMatchObject({
      url: "/api/admin/properties/p1/invitations",
      body: { email: "sam@demo-mgmt.com", name: "Sam", role: "director" },
    });
    expect(await screen.findByText("Invitation sent")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveValue("");
  });

  it("shows field errors from the API", async () => {
    mockFetch((_url, method) =>
      method === "POST" ? [422, { error: "Please fix the highlighted fields.", fieldErrors: { email: "Enter a valid email address" } }] : [200, detail()],
    );
    renderRoute("/admin/properties/:id", "/admin/properties/p1", <PropertyAdminPage />);
    await userEvent.type(await screen.findByLabelText("Email"), "nope");
    await userEvent.click(screen.getByRole("button", { name: "Send invitation" }));
    expect(await screen.findByText("Enter a valid email address")).toBeInTheDocument();
  });

  it("removes a manager's access after confirming", async () => {
    vi.stubGlobal("confirm", () => true);
    const calls = mockFetch((_url, method) => (method === "DELETE" ? [204, null] : [200, detail()]));
    renderRoute("/admin/properties/:id", "/admin/properties/p1", <PropertyAdminPage />);
    const row = (await screen.findByText("Pat Manager")).closest("li")!;
    await userEvent.click(within(row).getByRole("button", { name: "Remove access" }));
    expect(calls.find((c) => c.method === "DELETE")?.url).toBe("/api/admin/properties/p1/members/user_pm");
  });

  it("edits the Connecteam job", async () => {
    const calls = mockFetch((_url, method) => (method === "PATCH" ? [200, { property: detail().property }] : [200, detail()]));
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
    const calls = mockFetch(() => [201, { property: { ...detail().property, id: "p9" } }]);
    renderRoute("/admin/properties/new", "/admin/properties/new", <NewPropertyPage />);
    await userEvent.type(screen.getByLabelText("Property name"), "Sage Pointe");
    await userEvent.click(screen.getByRole("button", { name: "Add property" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/admin/properties/p9"));
    expect(calls[0]).toMatchObject({ url: "/api/admin/properties", method: "POST", body: { name: "Sage Pointe" } });
  });
});
