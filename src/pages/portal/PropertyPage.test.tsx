import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PropertyOverview } from "../../lib/api";
import { mockFetch, renderRoute } from "../../test/render";
import { PropertyPage } from "./PropertyPage";
import { PortalViolationPage } from "../violations/PortalViolations";

const noViolations = { items: [], total: 0, page: 1, pageSize: 25 };

const overview = (canManage: boolean): PropertyOverview => ({
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
    contractType: null,
    status: "active",
  },
  canManage,
  buildings: 0,
  units: 0,
  openReports: 0,
  recentReports: [],
});

afterEach(() => vi.unstubAllGlobals());

describe("PropertyPage", () => {
  it("lets a representative edit the basics", async () => {
    const calls = mockFetch((url, method) => (url.endsWith("/violations") ? [200, noViolations] : url.endsWith("/report") ? [404, {}] : method === "PATCH" ? [200, {}] : [200, overview(true)]));
    renderRoute("/portal/properties/:id", "/portal/properties/p1", <PropertyPage />);
    expect(await screen.findByRole("link", { name: "Demo Management" })).toHaveAttribute("href", "/portal/organizations/org1");
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    const units = screen.getByLabelText(/Number of units/);
    await userEvent.clear(units);
    await userEvent.type(units, "32");
    await userEvent.click(screen.getByRole("button", { name: "Save details" }));
    expect(await screen.findByText("Details saved.")).toBeInTheDocument();
    expect(calls.find((c) => c.method === "PATCH")).toMatchObject({
      url: "/api/portal/properties/p1",
      body: { name: "Demo Community", unitCount: "32" },
    });
  });

  it("gives property managers no edit button", async () => {
    mockFetch((url) => (url.endsWith("/violations") ? [200, noViolations] : url.endsWith("/report") ? [404, {}] : [200, overview(false)]));
    renderRoute("/portal/properties/:id", "/portal/properties/p1", <PropertyPage />);
    expect(await screen.findByText(/Something out of date\? Email/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.getByText("Demo Management")).toBeInTheDocument();
  });

  it("shows the team, violation numbers and Overwatch to the property", async () => {
    mockFetch((url) =>
      url.endsWith("/violations")
        ? [200, noViolations]
        : url.endsWith("/report")
          ? [404, {}]
          : [
              200,
              {
                ...overview(false),
                team: { steward: { id: "s1", name: "Dana Brooks" }, valets: [{ id: "v1", name: "Marcus Hill" }], staff: [{ id: "m1", name: "Pat Lee", role: "manager" }] },
                stats: { violations30d: 9, violationsPer100Units: 30, overwatchUnits: 2, overwatchThreshold: { count: 3, days: 30 } },
              },
            ],
    );
    renderRoute("/portal/properties/:id", "/portal/properties/p1", <PropertyPage />);
    expect(await screen.findByText("Dana Brooks")).toBeInTheDocument();
    expect(screen.getByText("Marcus Hill")).toBeInTheDocument();
    expect(screen.getByText("Pat Lee")).toBeInTheDocument();
    expect(screen.getByText("30 per 100 units")).toBeInTheDocument();
    expect(screen.getByText(/2 units have 3 or more violations in the last 30 days/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create Overwatch case" })).toBeDisabled();
  });

  it("previews what managers see for a Super Admin, with changes turned off", async () => {
    vi.stubGlobal("__clerkRole", "super_admin");
    const calls = mockFetch((url) => (url.includes("/violations") ? [200, noViolations] : url.includes("/report") ? [404, {}] : [200, overview(true)]));
    renderRoute("/portal/properties/:id", "/portal/properties/p1?as=manager", <PropertyPage />);
    expect(await screen.findByText("Previewing what property managers see.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to admin view" })).toHaveAttribute("href", "/admin/organizations/org1/properties/p1");
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(calls.some((c) => c.url === "/api/portal/properties/p1?as=manager")).toBe(true);
    expect(calls.some((c) => c.url === "/api/portal/properties/p1/violations?as=manager")).toBe(true);
  });

  it.each(["admin", "representative", "manager", "director", "lead", "valet"])("rejects a direct manager-preview URL for %s", (role) => {
    vi.stubGlobal("__clerkRole", role);
    const calls = mockFetch(() => [200, overview(true)]);
    renderRoute("/portal/properties/:id", "/portal/properties/p1?as=manager", <PropertyPage />);
    expect(screen.getByRole("alert")).toHaveTextContent("Only Super Admins");
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it("rejects a direct violation-preview URL for a regular admin", () => {
    vi.stubGlobal("__clerkRole", "admin");
    const calls = mockFetch(() => [200, {}]);
    renderRoute("/portal/violations/:id", "/portal/violations/v1?as=manager", <PortalViolationPage />);
    expect(screen.getByRole("alert")).toHaveTextContent("Only Super Admins");
    expect(calls).toHaveLength(0);
  });
});
