import { screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockFetch, renderRoute } from "../../test/render";
import { KeepQueryRedirect, PropertyRedirect } from "./redirects";

afterEach(() => vi.unstubAllGlobals());

const property = (organizationId: string | null) => ({ property: { id: "p1", name: "The Oaks", organizationId }, members: [], invitations: [] });

describe("PropertyRedirect", () => {
  it("sends an old property link to the property inside its organization", async () => {
    mockFetch(() => [200, property("org1")]);
    renderRoute("/admin/properties/:id", "/admin/properties/p1", <PropertyRedirect />);
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/admin/organizations/org1/properties/p1"));
  });

  it("sends a property with no organization to the cleanup list", async () => {
    mockFetch(() => [200, property(null)]);
    renderRoute("/admin/properties/:id", "/admin/properties/p1", <PropertyRedirect />);
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/admin/organizations?unassigned=1"));
  });

  it("shows the API's message when the property can't be found", async () => {
    mockFetch(() => [404, { error: "Property not found." }]);
    renderRoute("/admin/properties/:id", "/admin/properties/p1", <PropertyRedirect />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Property not found.");
  });
});

describe("KeepQueryRedirect", () => {
  it("sends an old Reports link to Issues with its filters", async () => {
    renderRoute("/admin/reports", "/admin/reports?tab=open&dates=all", <KeepQueryRedirect to="/admin/issues" />);
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/admin/issues?tab=open&dates=all"));
  });

  it("keeps the issue an old emailed link points at", async () => {
    renderRoute("/admin/reports/:id", "/admin/reports/r1?tab=new", <KeepQueryRedirect to="/admin/issues/:id" />);
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/admin/issues/r1?tab=new"));
  });
});
