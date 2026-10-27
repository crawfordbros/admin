import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PropertyOverview } from "../../lib/api";
import { mockFetch, renderRoute } from "../../test/render";
import { PropertyPage } from "./PropertyPage";

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
    const calls = mockFetch((_url, method) => (method === "PATCH" ? [200, {}] : [200, overview(true)]));
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
    mockFetch(() => [200, overview(false)]);
    renderRoute("/portal/properties/:id", "/portal/properties/p1", <PropertyPage />);
    expect(await screen.findByText(/Something out of date\? Email/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.getByText("Demo Management")).toBeInTheDocument();
  });
});
