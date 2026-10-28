import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockFetch, renderRoute } from "../../test/render";
import { propertyDetail, reportRow, violationRow } from "../../test/fixtures";
import { PropertyDetailPage } from "./PropertyDetailPage";

const ROUTE = "/admin/organizations/:orgId/properties/:propertyId";
const show = (url = "/admin/organizations/org1/properties/p1") => renderRoute(ROUTE, url, <PropertyDetailPage />);

const handler = (url: string, method: string): [number, unknown] => {
  if (url === "/api/organizations/org1/properties/p1" && method === "GET") return [200, propertyDetail()];
  if (url === "/api/organizations/org1/properties/p1" && method === "PATCH") return [200, { property: propertyDetail().property }];
  if (url === "/api/admin/stewards") return [200, { items: [{ id: "user_lead", name: "Dana Brooks", email: "d@x", propertyCount: 4 }, { id: "user_lead2", name: "Andre Lewis", email: "a@x", propertyCount: 2 }] }];
  if (url === "/api/admin/valets") return [200, { items: [{ id: "user_valet", name: "Marcus Hill", email: "m@x" }, { id: "user_valet2", name: "Tasha Reed", email: "t@x" }] }];
  if (url.startsWith("/api/admin/properties/p1/valets/")) return [204, null];
  if (url.startsWith("/api/portal/properties/p1/report")) return [200, { week: { start: "2026-10-18", end: "2026-10-24", label: "Oct 18 – 24" }, valetTimes: { status: "no_job" } }];
  if (url === "/api/organizations") return [200, { organizations: [] }];
  return [404, { error: "Not found" }];
};

afterEach(() => vi.unstubAllGlobals());

describe("PropertyDetailPage", () => {
  it("shows the property's profile, numbers and teams", async () => {
    mockFetch(handler);
    show();
    expect(await screen.findByRole("heading", { name: "Demo Community", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("215 Commerce Dr, Decatur, GA 30030 · DeKalb County")).toBeInTheDocument();
    expect(screen.getByText("312 units · 6 buildings")).toBeInTheDocument();
    expect(screen.getByText("36-month · since Apr 2026")).toBeInTheDocument();
    expect(screen.getByText("Connecteam job 48107")).toBeInTheDocument();
    expect(screen.getByText("Oldest 21 hours")).toBeInTheDocument();
    expect(screen.getByText("#1042 Missed pickup")).toBeInTheDocument();
    expect(screen.getByText("Steward · 4 properties")).toBeInTheDocument();
    expect(await screen.findByText(/once CBES links this property to its Connecteam job/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /See what managers see/ })).toHaveAttribute("href", "/portal/properties/p1?as=manager");
  });

  it("assigns the Steward and a valet from the Team tab", async () => {
    const calls = mockFetch(handler);
    show("/admin/organizations/org1/properties/p1?tab=team");
    await screen.findByRole("option", { name: /Andre Lewis/ });
    await userEvent.selectOptions(screen.getByLabelText("Steward"), "user_lead2");
    await waitFor(() => expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ stewardUserId: "user_lead2" }));
    expect(await screen.findByText("Andre Lewis is now the Steward.")).toBeInTheDocument();
    await userEvent.selectOptions(await screen.findByLabelText("Assign a valet"), "user_valet2");
    await waitFor(() => expect(calls.find((c) => c.method === "PUT")?.url).toBe("/api/admin/properties/p1/valets/user_valet2"));
  });

  it("saves the details from Settings", async () => {
    const calls = mockFetch(handler);
    show("/admin/organizations/org1/properties/p1?tab=settings");
    const units = await screen.findByLabelText(/^Units/);
    await userEvent.clear(units);
    await userEvent.type(units, "320");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Property saved.")).toBeInTheDocument();
    expect(calls.find((c) => c.method === "PATCH")?.body).toMatchObject({ unitCount: 320, zip: "30030", propertyType: "garden", connecteamJobId: "48107" });
  });

  it("lists recent weeks to preview", async () => {
    mockFetch(handler);
    show("/admin/organizations/org1/properties/p1?tab=weekly");
    const panel = await screen.findByRole("tabpanel");
    const previews = within(panel).getAllByRole("link", { name: "Preview" });
    expect(previews).toHaveLength(8);
    expect(previews[0].getAttribute("href")).toMatch(/^\/portal\/properties\/p1\/report\?week=\d{4}-\d{2}-\d{2}$/);
  });

  it("lists the property's violations, reports and Overwatch units in their tabs", async () => {
    const calls = mockFetch((url, method) => {
      if (url.startsWith("/api/admin/violations?"))
        return [200, { items: [violationRow({ id: "v1", refNo: 2041 })], total: 1, page: 1, pageSize: 20, stageCounts: { new: 1, in_review: 0, sent: 0, resolved: 0, dismissed: 0 } }];
      if (url.startsWith("/api/admin/reports?")) return [200, { items: [reportRow({ id: "r1", refNo: 1042 })], total: 1, page: 1, pageSize: 20, tabCounts: { open: 1, new: 1, in_progress: 0, resolved: 0, closed: 0 } }];
      if (url === "/api/admin/overwatch/preview")
        return [200, { threshold: { count: 3, days: 30, countDismissed: false }, units: [{ propertyId: "p1", propertyName: "x", orgId: "org1", orgName: "y", unit: "412", count: 4, mostCommon: "Bag not tied", lastAt: new Date().toISOString() }, { propertyId: "p9", propertyName: "z", orgId: null, orgName: null, unit: "1", count: 3, mostCommon: "Other", lastAt: new Date().toISOString() }] }];
      return handler(url, method);
    });
    show("/admin/organizations/org1/properties/p1?tab=violations");
    expect(await screen.findByRole("link", { name: /V-2041/ })).toHaveAttribute("href", "/admin/violations/v1");
    expect(calls.some((c) => c.url.startsWith("/api/admin/violations?property=p1&stage=all"))).toBe(true);
    expect(screen.getByRole("link", { name: "Open in Violations" })).toHaveAttribute("href", "/admin/violations?property=p1&stage=all");

    await userEvent.click(screen.getByRole("tab", { name: /Reports/ }));
    expect(await screen.findByRole("link", { name: /#1042/ })).toHaveAttribute("href", "/admin/reports/r1");

    await userEvent.click(screen.getByRole("tab", { name: "Overwatch" }));
    expect(await screen.findByText("Unit 412")).toBeInTheDocument();
    expect(screen.queryByText("Unit 1")).not.toBeInTheDocument();
  });

  it("follows a property that moved to another organization", async () => {
    mockFetch((url, method) => (url === "/api/organizations/org1/properties/p1" ? [404, { error: "Not found" }] : handler(url, method)));
    show();
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/admin/properties/p1"));
  });
});
