import { screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockFetch, renderRoute } from "../test/render";
import { PortalHome } from "./PortalHome";

afterEach(() => vi.unstubAllGlobals());

const me = (role: string, properties: { id: string; name: string }[]) => ({
  user: { id: "u1", email: "pat@demo-mgmt.com", name: "Pat Manager", role },
  properties: properties.map((p) => ({ ...p, slug: p.id, city: null })),
});

describe("PortalHome", () => {
  it("takes a manager with one property straight to it", async () => {
    mockFetch(() => [200, me("manager", [{ id: "p1", name: "Demo Community" }])]);
    renderRoute("/portal", "/portal", <PortalHome />);
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/portal/properties/p1"));
  });

  it("lists properties for a manager with several", async () => {
    mockFetch(() => [200, me("manager", [{ id: "p1", name: "Demo Community" }, { id: "p2", name: "Other Place" }])]);
    renderRoute("/portal", "/portal", <PortalHome />);
    expect(await screen.findByRole("link", { name: "Other Place" })).toHaveAttribute("href", "/portal/properties/p2");
  });

  it("explains when no property is linked yet", async () => {
    mockFetch(() => [200, me("manager", [])]);
    renderRoute("/portal", "/portal", <PortalHome />);
    expect(await screen.findByText(/You don't have a property yet/)).toBeInTheDocument();
  });

  it("shows the API's reason when the account isn't set up", async () => {
    mockFetch(() => [403, { error: "Your account isn't set up yet." }]);
    renderRoute("/portal", "/portal", <PortalHome />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Your account isn't set up yet.");
  });
});
