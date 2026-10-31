import * as places from "../../lib/places";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Outlet, Route } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockFetch, renderRoute } from "../../test/render";
import { orgDetail } from "../../test/fixtures";
import { AddPropertyModal, type OrgOutletContext } from "./AddPropertyModal";

const stewards = { items: [{ id: "user_lead", name: "Dana Brooks", email: "dana@cbenvironments.com", propertyCount: 4 }] };

function Org({ ctx }: { ctx: OrgOutletContext }) {
  return (
    <>
      <p>Organization page</p>
      <Outlet context={ctx} />
    </>
  );
}

function open(isAdmin: boolean, handler: Parameters<typeof mockFetch>[0]) {
  const calls = mockFetch(handler);
  const ctx: OrgOutletContext = { detail: orgDetail(), area: isAdmin ? "admin" : "portal", isAdmin };
  const base = isAdmin ? "/admin/organizations/:orgId" : "/portal/organizations/:orgId";
  renderRoute(base, `${base.replace(":orgId", "org1")}/properties/new`, <Org ctx={ctx} />, <Route path="properties/new" element={<AddPropertyModal />} />);
  return { calls, dialog: screen.getByRole("dialog", { name: "Add a property" }) };
}

const api = (created = { property: { id: "p9", name: "North Druid Flats" }, invitations: [] as unknown[] }) => (url: string, method: string): [number, unknown] => {
  if (url.startsWith("/api/organizations/org1/slug-available")) return [200, { available: true, suggestion: null }];
  if (url === "/api/admin/stewards") return [200, stewards];
  if (method === "POST" && url === "/api/organizations/org1/properties") return [201, created];
  return [404, { error: "Not found" }];
};

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("AddPropertyModal", () => {
  it("rejects whitespace-only addresses and invalid ZIP before making a request", async () => {
    const { calls, dialog } = open(true, api());
    await userEvent.type(within(dialog).getByLabelText("Property name"), "Manual address");
    await userEvent.type(within(dialog).getByLabelText("Units"), "10");
    await userEvent.type(within(dialog).getByLabelText("Street address"), "   ");
    await userEvent.type(within(dialog).getByLabelText("City"), "   ");
    await userEvent.type(within(dialog).getByLabelText("ZIP"), "123");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add property" }));
    for (const message of ["Enter the street address", "Enter the city", "Use a 5-digit ZIP code or ZIP+4"]) expect(within(dialog).getByText(message)).toBeInTheDocument();
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("adds the property with its invites and opens it", async () => {
    const { calls, dialog } = open(true, api({ property: { id: "p9", name: "North Druid Flats" }, invitations: [{ email: "k.james@demo-mgmt.com", status: "invited" }] }));
    expect(dialog).toHaveTextContent("Demo Management · 2 of 100 properties");
    expect(dialog).toHaveTextContent("This will be property 3 of 100");
    await userEvent.type(within(dialog).getByLabelText("Street address"), "1450 N Druid Hills Rd NE");
    await userEvent.type(within(dialog).getByLabelText("City"), "Brookhaven");
    await userEvent.type(within(dialog).getByLabelText("ZIP"), "30329");
    await userEvent.type(within(dialog).getByLabelText("Property name"), "North Druid Flats");
    await userEvent.type(within(dialog).getByLabelText("Units"), "360");
    await userEvent.click(within(dialog).getByRole("radio", { name: "Mid-rise" }));
    await userEvent.click(within(dialog).getByRole("radio", { name: "36-month" }));
    expect(within(dialog).getByLabelText("Report an Issue web address")).toHaveValue("north-druid-flats");
    await userEvent.type(within(dialog).getByLabelText("Connecteam job ID"), "48213");
    await userEvent.type(within(dialog).getByLabelText("Email for person 1"), "k.james@demo-mgmt.com");
    await userEvent.selectOptions(within(dialog).getByLabelText("Role for person 1"), "manager");
    await userEvent.selectOptions(await within(dialog).findByLabelText("Steward"), "user_lead");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add property and send 1 invite" }));

    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/admin/organizations/org1/properties/p9"));
    expect(await screen.findByText("North Druid Flats added. 1 invitation sent.")).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({
      name: "North Druid Flats",
      address: "1450 N Druid Hills Rd NE",
      city: "Brookhaven",
      zip: "30329",
      unitCount: 360,
      propertyType: "mid_rise",
      contractType: "36_month",
      slug: "north-druid-flats",
      connecteamJobId: "48213",
      stewardUserId: "user_lead",
      invites: [{ email: "k.james@demo-mgmt.com", role: "manager" }],
    });
  });

  it("saves an address filled by autocomplete", async () => {
    const picked = { address: "1450 N Druid Hills Rd NE", city: "Brookhaven", county: "DeKalb", zip: "30329", lat: null, lng: null, googlePlaceId: "place-1", establishment: "North Druid Flats" };
    vi.spyOn(places, "placesAvailable").mockReturnValue(true);
    vi.spyOn(places, "placesSession").mockReturnValue({
      suggest: vi.fn().mockResolvedValue([{ placeId: "place-1", main: picked.address, secondary: "Brookhaven, GA" }]),
      details: vi.fn().mockResolvedValue(picked),
    });
    const { calls, dialog } = open(true, api());
    await userEvent.type(within(dialog).getByLabelText("Street address"), "1450");
    await userEvent.click(await within(dialog).findByRole("option", { name: /1450 N Druid/ }));
    expect(within(dialog).getByLabelText("City")).toHaveValue("Brookhaven");
    expect(within(dialog).getByLabelText("ZIP")).toHaveValue("30329");
    await userEvent.type(within(dialog).getByLabelText("Units"), "20");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add property" }));
    await waitFor(() => expect(calls.find((c) => c.method === "POST")?.body).toMatchObject({ address: picked.address, city: picked.city, zip: picked.zip, googlePlaceId: "place-1" }));
  });

  it("hides CBES-only fields from representatives and never sends them", async () => {
    const { calls, dialog } = open(false, api());
    // Representatives invite property managers only.
    const role = within(dialog).getByLabelText("Role for person 1");
    expect(within(role).getAllByRole("option").map((o) => o.textContent)).toEqual(["Property Manager"]);
    expect(role).toBeDisabled();
    expect(within(dialog).queryByLabelText("Connecteam job ID")).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Steward")).not.toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText("Street address"), "1 Main St");
    await userEvent.type(within(dialog).getByLabelText("City"), "Decatur");
    await userEvent.type(within(dialog).getByLabelText("ZIP"), "30030");
    await userEvent.type(within(dialog).getByLabelText("Property name"), "Sage Pointe");
    await userEvent.type(within(dialog).getByLabelText("Units"), "120");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add property" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/portal/properties/p9"));
    const body = calls.find((c) => c.method === "POST")?.body as Record<string, unknown>;
    expect(body).not.toHaveProperty("connecteamJobId");
    expect(body).not.toHaveProperty("stewardUserId");
    expect(calls.some((c) => c.url === "/api/admin/stewards")).toBe(false);
  });

  it("checks the required fields and duplicate emails before sending", async () => {
    const { calls, dialog } = open(false, api());
    await userEvent.click(within(dialog).getByRole("button", { name: "Add another person" }));
    await userEvent.type(within(dialog).getByLabelText("Email for person 1"), "pat@demo-mgmt.com");
    await userEvent.type(within(dialog).getByLabelText("Email for person 2"), "PAT@demo-mgmt.com");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add property and send 2 invites" }));
    expect(within(dialog).getByText("Enter the property name")).toBeInTheDocument();
    expect(within(dialog).getByText("Enter the number of units, 1 to 5,000")).toBeInTheDocument();
    expect(within(dialog).getByText("This email is already on the list")).toBeInTheDocument();
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("explains when the organization is full", async () => {
    const { dialog } = open(false, (url, method) =>
      method === "POST" ? [409, { error: "This organization has reached its limit of 100 properties.", code: "limit_reached" }] : api()(url, method),
    );
    await userEvent.type(within(dialog).getByLabelText("Street address"), "1 Main St");
    await userEvent.type(within(dialog).getByLabelText("City"), "Decatur");
    await userEvent.type(within(dialog).getByLabelText("ZIP"), "30030");
    await userEvent.type(within(dialog).getByLabelText("Property name"), "Sage Pointe");
    await userEvent.type(within(dialog).getByLabelText("Units"), "120");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add property" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("reached its limit of 100 properties");
  });

  it("offers a free web address when the one from the name is taken", async () => {
    const { dialog } = open(false, (url, method) =>
      url.startsWith("/api/organizations/org1/slug-available") ? [200, { available: false, suggestion: "sage-pointe-2" }] : api()(url, method),
    );
    await userEvent.type(within(dialog).getByLabelText("Street address"), "1 Main St");
    await userEvent.type(within(dialog).getByLabelText("City"), "Decatur");
    await userEvent.type(within(dialog).getByLabelText("ZIP"), "30030");
    await userEvent.type(within(dialog).getByLabelText("Property name"), "Sage Pointe");
    await userEvent.click(await within(dialog).findByRole("button", { name: "Use sage-pointe-2" }, { timeout: 2000 }));
    expect(within(dialog).getByLabelText("Report an Issue web address")).toHaveValue("sage-pointe-2");
  });

  it("closes back to the organization", async () => {
    const { dialog } = open(true, api());
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/admin/organizations/org1");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
