import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RepDashboard } from "../../../lib/api";
import { nextSunday } from "../../../lib/format";
import { mockFetch, renderRoute } from "../../../test/render";
import { RepAddPropertyModal } from "./RepAddPropertyModal";
import { RepDashboardPage } from "./RepDashboardPage";

const card = (id: string, name: string, extra: Partial<RepDashboard["properties"][number]> = {}): RepDashboard["properties"][number] => ({
  id,
  name,
  city: "Decatur",
  units: 312,
  photoVersion: null,
  status: "active",
  serviceStartDate: null,
  violationsToReview: 0,
  openIssues: 0,
  managers: [],
  ...extra,
});

const dashboard = (patch: Partial<RepDashboard> = {}): RepDashboard => ({
  organization: { id: "org1", name: "Peachtree Residential", logoVersion: null, propertyCount: 2, propertyLimit: 100 },
  week: { start: "2026-10-25", label: "Week of Oct 25" },
  kpis: {
    properties: { value: 2, limit: 100, units: 592 },
    violationsToReview: 1,
    openIssues: { value: 1, oldestHours: 9 },
    serviceNights: { serviced: 5, scheduled: 6, label: "Sun–Tue this week" },
    avgFirstReplyHours30d: 4.9,
  },
  attention: [
    { kind: "violation", id: "v1", ref: "V-2041", title: "Bag not tied", statusLabel: "To review", propertyId: "p1", propertyName: "The Oaks at Decatur", where: "Bldg 4 · Unit 412", ageHours: 52, link: "/portal/violations/v1" },
    { kind: "issue", id: "r1", ref: "#1042", title: "Missed pickup", statusLabel: "CBES replied", propertyId: "p1", propertyName: "The Oaks at Decatur", where: "Unit 305", ageHours: 9, link: "/portal/issues/r1" },
  ],
  properties: [
    card("p1", "The Oaks at Decatur", { violationsToReview: 1, openIssues: 1, managers: [{ id: "u-chris", name: "Chris Patel", role: "manager" }] }),
    card("p2", "North Druid Flats", { status: "starting", serviceStartDate: "2026-11-08" }),
  ],
  violationsByNight: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, i) => ({ date: `2026-10-${25 + i}`, day, count: i < 3 ? i + 1 : null })),
  topViolationTypes: [
    { label: "Bag not tied", count: 4 },
    { label: "Out after 8 PM", count: 2 },
  ],
  lastWeek: { activeProperties: 1, serviced: 5, scheduled: 5, violationsSent: 19, issues: 4, allRepliedWithin24h: true },
  nextWeeklyReportAt: "2026-11-02T12:00:00.000Z",
  pendingInvitations: [{ id: "inv1", email: "m.ortega@peachtreeres.com", role: "manager", propertyNames: ["The Oaks at Decatur"], createdAt: "2026-10-01T00:00:00.000Z", expired: true }],
  contacts: [{ id: "u-dana", name: "Dana Brooks", title: "Steward · The Oaks at Decatur" }],
  ...patch,
});

const me = { user: { id: "u-rep", email: "lauren@peachtree.com", name: "Lauren Kim", role: "representative" }, organizations: [], properties: [] };
const org = {
  organization: { id: "org1", name: "Peachtree Residential", propertyLimit: 100, logoVersion: null },
  staff: [
    { id: "u-chris", email: "chris@peachtree.com", name: "Chris Patel", role: "manager", propertyId: "p1", propertyName: "The Oaks at Decatur" },
    { id: "u-renee", email: "renee@peachtree.com", name: "Renee Ford", role: "manager", propertyId: "p9", propertyName: "Brookhaven Terrace" },
    { id: "u-renee", email: "renee@peachtree.com", name: "Renee Ford", role: "manager", propertyId: "p8", propertyName: "Scottdale Gardens" },
  ],
};

type Handler = (url: string, method: string, body: unknown) => [number, unknown] | undefined;
function api(data: RepDashboard | [number, unknown] = dashboard(), extra: Handler = () => undefined) {
  return mockFetch((url, method, body) => {
    const hit = extra(url, method, body);
    if (hit) return hit;
    if (url === "/api/portal/organizations/org1/dashboard") return Array.isArray(data) ? data : [200, data];
    if (url === "/api/portal/me") return [200, me];
    if (url === "/api/organizations/org1") return [200, org];
    if (url.startsWith("/api/organizations/org1/slug-available")) return [200, { available: true, suggestion: null }];
    return [404, { error: "Not found" }];
  });
}

const show = (url = "/portal/organizations/org1") =>
  renderRoute("/portal/organizations/:orgId", url, <RepDashboardPage />, <Route path="properties/new" element={<RepAddPropertyModal />} />);

beforeEach(() => vi.stubGlobal("__clerkRole", "representative"));
afterEach(() => vi.unstubAllGlobals());

describe("RepDashboardPage", () => {
  it("shows a skeleton while it loads", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    show();
    expect(await screen.findByRole("status", { name: "Loading" }, { timeout: 1500 })).toBeInTheDocument();
  });

  it("explains a failure and retries", async () => {
    let fail = true;
    const calls = api(dashboard(), (url) => (url.endsWith("/dashboard") && fail ? [500, { error: "The dashboard is unavailable." }] : undefined));
    show();
    expect(await screen.findByRole("alert")).toHaveTextContent("The dashboard is unavailable.");
    fail = false;
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(calls.filter((c) => c.url.endsWith("/dashboard"))).toHaveLength(2);
  });

  it("greets the Representative and says what's waiting", async () => {
    api();
    show();
    expect(await screen.findByRole("heading", { level: 1, name: /^Good (morning|afternoon|evening), Lauren$/ })).toBeInTheDocument();
    expect(screen.getByText("Peachtree Residential · Week of Oct 25")).toBeInTheDocument();
    expect(screen.getByText("1 violation and 1 resident issue are waiting across your properties.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Reporting" })).toHaveAttribute("href", "/portal/reporting?scope=organization&org=org1");
    expect(screen.getByRole("link", { name: "Add property" })).toHaveAttribute("href", "/portal/organizations/org1/properties/new");
    expect(document.title).toBe("Dashboard | CBES Portal");
  });

  it("links each KPI to the page that explains it", async () => {
    api();
    show();
    expect(await screen.findByRole("link", { name: /Violations to review/ })).toHaveAttribute("href", "/portal/violations?org=org1");
    expect(screen.getByRole("link", { name: /Open resident issues.*Oldest 9 hours/ })).toHaveAttribute("href", "/portal/issues?org=org1");
    expect(screen.getByRole("link", { name: /Service nights.*5 of 6.*Sun–Tue this week/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /CBES first reply.*4\.9h/ })).toBeInTheDocument();
    expect(screen.getByText("2 of 100")).toBeInTheDocument();
  });

  it("lists what needs attention, filtered in the URL", async () => {
    api();
    show();
    const list = await screen.findByRole("region", { name: "Needs your attention" });
    expect(within(list).getByRole("link", { name: "Review V-2041" })).toHaveAttribute("href", "/portal/violations/v1");
    expect(within(list).getByRole("link", { name: "View #1042" })).toHaveAttribute("href", "/portal/issues/r1");
    expect(within(list).getByText("2 days")).toHaveClass("text-danger");
    expect(within(list).getByText("CBES replied")).toBeInTheDocument();
    await userEvent.click(within(list).getByRole("button", { name: "Issues 1" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/portal/organizations/org1?filter=issues");
    expect(within(list).queryByRole("link", { name: "Review V-2041" })).not.toBeInTheDocument();
  });

  it("says when nothing is waiting", async () => {
    api(dashboard({ attention: [], kpis: { ...dashboard().kpis, violationsToReview: 0, openIssues: { value: 0, oldestHours: null } } }));
    show();
    expect(await screen.findByText("You're all caught up.")).toBeInTheDocument();
    expect(screen.getByText("Nothing needs you right now.")).toBeInTheDocument();
  });

  it("shows each property with its counts and manager", async () => {
    api();
    show();
    const oaks = (await screen.findByRole("link", { name: "The Oaks at Decatur" })).closest("article")!;
    expect(within(oaks).getByText("1 to review")).toBeInTheDocument();
    expect(within(oaks).getByText("Chris Patel")).toBeInTheDocument();
    expect(within(oaks).getByRole("button", { name: "Change managers for The Oaks at Decatur" })).toBeInTheDocument();
    const flats = screen.getByRole("link", { name: "North Druid Flats" }).closest("article")!;
    expect(within(flats).getByText("Starting Nov 8")).toBeInTheDocument();
    expect(within(flats).getByText("No manager yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Add a property.*98 of 100 slots left/ })).toBeInTheDocument();
  });

  it("shows distinct addresses and links for properties with the same name", async () => {
    api(dashboard({ properties: [
      card("p1", "The Oaks", { address: "1 North Main St", city: "Decatur", zip: "30030" }),
      card("p2", "The Oaks", { address: "2 South Main St", city: "Atlanta", zip: "30303" }),
    ] }));
    show();
    const links = await screen.findAllByRole("link", { name: "The Oaks" });
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute("href", "/portal/properties/p1");
    expect(links[1]).toHaveAttribute("href", "/portal/properties/p2");
    expect(links[0].closest("article")).toHaveTextContent("1 North Main St, Decatur, GA 30030");
    expect(links[1].closest("article")).toHaveTextContent("2 South Main St, Atlanta, GA 30303");
  });

  it("filters properties as you type", async () => {
    api();
    show();
    await userEvent.type(await screen.findByLabelText("Search properties"), "druid");
    expect(screen.queryByRole("link", { name: "The Oaks at Decatur" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "North Druid Flats" })).toBeInTheDocument();
  });

  it("invites a first property when there are none", async () => {
    api(dashboard({ organization: { ...dashboard().organization, propertyCount: 0 }, properties: [], attention: [], kpis: { ...dashboard().kpis, properties: { value: 0, limit: 100, units: 0 } } }));
    show();
    expect(await screen.findByRole("heading", { name: "Add your first property" })).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });

  it("hides Add property at the limit", async () => {
    const full = dashboard();
    api(dashboard({ organization: { ...full.organization, propertyCount: 2, propertyLimit: 2 } }));
    show();
    expect(await screen.findByText("2 of 2 properties")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Add property" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Add a property/ })).not.toBeInTheDocument();
  });

  it("fills the aside: weekly report, this week's violations, invitations and contacts", async () => {
    api();
    show();
    expect(await screen.findByText(/Next: Monday, Nov 2 at 7 AM ET/)).toBeInTheDocument();
    expect(screen.getByText("Last week across 1 active property: 5 of 5 service nights, 19 violations sent, 4 resident issues, all replied to within 24 hours.")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Sun 1, Mon 2, Tue 3\. Wed to Sat not yet/ })).toBeInTheDocument();
    expect(screen.getByText("m.ortega@peachtreeres.com")).toBeInTheDocument();
    expect(screen.getByText("Expired")).toBeInTheDocument();
    expect(screen.getByText("Steward · The Oaks at Decatur")).toBeInTheDocument();
  });

  it("resends an invitation", async () => {
    const calls = api(dashboard(), (url, method) => (method === "POST" && url.endsWith("/resend") ? [204, null] : undefined));
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Resend the invitation to m.ortega@peachtreeres.com" }));
    expect(await screen.findByText("Invitation sent again to m.ortega@peachtreeres.com.")).toBeInTheDocument();
    expect(calls.some((c) => c.method === "POST" && c.url === "/api/organizations/org1/invitations/inv1/resend")).toBe(true);
  });

  it.each(["people", "invitations"])("sends ?tab=%s to Team and settings", async (tab) => {
    api();
    show(`/portal/organizations/org1?tab=${tab}`);
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent(`/portal/organizations/org1/settings?tab=${tab}`));
  });
});

describe("Assign manager", () => {
  it("adds someone from the team and invites someone new", async () => {
    const calls = api(dashboard(), (url, method) => (method === "POST" && (url.endsWith("/members") || url.endsWith("/invitations")) ? [201, {}] : undefined));
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Assign a manager to North Druid Flats" }));
    const dialog = screen.getByRole("dialog", { name: "Managers for North Druid Flats" });
    await userEvent.click(await within(dialog).findByRole("checkbox", { name: /Renee Ford/ }));
    await userEvent.type(within(dialog).getByLabelText("Email for person 1"), "dee@peachtree.com");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save managers" }));
    expect(await screen.findByText("Managers updated.")).toBeInTheDocument();
    expect(calls).toContainEqual(expect.objectContaining({ method: "POST", url: "/api/organizations/org1/properties/p2/members", body: { userId: "u-renee" } }));
    expect(calls).toContainEqual(expect.objectContaining({ method: "POST", url: "/api/organizations/org1/invitations", body: { email: "dee@peachtree.com", role: "manager", propertyIds: ["p2"] } }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("warns that removing someone from their only property ends their access", async () => {
    const calls = api(dashboard(), (_url, method) => (method === "DELETE" ? [204, null] : undefined));
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Change managers for The Oaks at Decatur" }));
    const dialog = screen.getByRole("dialog", { name: "Managers for The Oaks at Decatur" });
    await userEvent.click(await within(dialog).findByRole("checkbox", { name: /Chris Patel/ }));
    expect(within(dialog).getByRole("status")).toHaveTextContent("Chris Patel has no other property, so removing them ends their portal access.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save managers" }));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE" && c.url === "/api/organizations/org1/properties/p1/members/u-chris")).toBe(true));
  });

  it("checks new emails before saving", async () => {
    api();
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Assign a manager to North Druid Flats" }));
    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Email for person 1"), "not-an-email");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save managers" }));
    expect(within(dialog).getByText("Enter a valid email address")).toBeInTheDocument();
  });
});

describe("Add a property (Representative)", () => {
  const open = async () => {
    show("/portal/organizations/org1/properties/new");
    return screen.findByRole("dialog", { name: "Add a property" });
  };

  it("asks only what a Representative sets: no contract, Connecteam job or Steward", async () => {
    api();
    const dialog = await open();
    expect(within(dialog).getByText("Peachtree Residential · 2 of 100 properties")).toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Connecteam job ID")).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Steward")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Contract")).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Role for person 1")).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText("Service start date")).toHaveValue(nextSunday());
    expect(within(dialog).getByText("This will be property 3 of 100")).toBeInTheDocument();
  });

  it("says whether the county is in the service area", async () => {
    api();
    const dialog = await open();
    await userEvent.type(within(dialog).getByLabelText("County"), "DeKalb");
    expect(within(dialog).getByText("Inside the CBES service area (DeKalb County).")).toBeInTheDocument();
    await userEvent.clear(within(dialog).getByLabelText("County"));
    await userEvent.type(within(dialog).getByLabelText("County"), "Chatham");
    expect(within(dialog).getByText("Outside our usual area. CBES will reach out.")).toBeInTheDocument();
  });

  it("requires the address, name and units", async () => {
    const calls = api();
    const dialog = await open();
    await userEvent.click(within(dialog).getByRole("button", { name: "Add property" }));
    expect(within(dialog).getByText("Enter the street address")).toBeInTheDocument();
    expect(within(dialog).getByText("Enter the city")).toBeInTheDocument();
    expect(within(dialog).getByText("Use a 5-digit ZIP code or ZIP+4")).toBeInTheDocument();
    expect(within(dialog).getByText("Enter the property name")).toBeInTheDocument();
    expect(within(dialog).getByText("Enter the number of units, 1 to 5,000")).toBeInTheDocument();
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("adds the property with picked managers and invites, then returns to the dashboard", async () => {
    const calls = api(dashboard(), (url, method) =>
      method === "POST" && url === "/api/organizations/org1/properties"
        ? [201, { property: { id: "p3", name: "Willow Bend" }, invitations: [{ email: "dee@peachtree.com", status: "invited" }] }]
        : undefined,
    );
    const dialog = await open();
    await userEvent.type(within(dialog).getByLabelText("Street address"), "3400 Scott Blvd");
    await userEvent.type(within(dialog).getByLabelText("City"), "Decatur");
    await userEvent.type(within(dialog).getByLabelText("ZIP"), "30030");
    await userEvent.type(within(dialog).getByLabelText("County"), "DeKalb");
    await userEvent.type(within(dialog).getByLabelText("Property name"), "Willow Bend");
    await userEvent.type(within(dialog).getByLabelText("Units"), "228");
    await userEvent.selectOptions(within(dialog).getByLabelText("Trash-out window"), "19:00-21:00");
    await userEvent.click(within(dialog).getByRole("checkbox", { name: /Include yearly spot pressure washing/ }));
    await userEvent.click(await within(dialog).findByRole("checkbox", { name: /Chris Patel/ }));
    await userEvent.type(within(dialog).getByLabelText("Email for person 1"), "dee@peachtree.com");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add property and invite 1 person" }));

    expect(await screen.findByText("Willow Bend added.")).toBeInTheDocument();
    const post = calls.find((c) => c.method === "POST" && c.url === "/api/organizations/org1/properties")!;
    expect(post.body).toMatchObject({
      name: "Willow Bend",
      address: "3400 Scott Blvd",
      county: "DeKalb",
      unitCount: 228,
      serviceStartDate: nextSunday(),
      trashOutWindow: "19:00-21:00",
      pressureWashing: true,
      slug: "willow-bend",
      managerUserIds: ["u-chris"],
      invites: [{ email: "dee@peachtree.com", role: "manager" }],
    });
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent(/^\/portal\/organizations\/org1$/));
  });

  it("explains the property limit", async () => {
    api(dashboard(), (url, method) => (method === "POST" && url === "/api/organizations/org1/properties" ? [409, { error: "limit", code: "limit_reached" }] : undefined));
    const dialog = await open();
    await userEvent.type(within(dialog).getByLabelText("Street address"), "1 Main St");
    await userEvent.type(within(dialog).getByLabelText("City"), "Decatur");
    await userEvent.type(within(dialog).getByLabelText("ZIP"), "30030");
    await userEvent.type(within(dialog).getByLabelText("Property name"), "One More");
    await userEvent.type(within(dialog).getByLabelText("Units"), "10");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add property" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("You've reached 100 properties. Email office@cbenvironments.com to raise the limit.");
  });

  it("closes back to the dashboard", async () => {
    api();
    const dialog = await open();
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent(/^\/portal\/organizations\/org1$/));
  });
});
