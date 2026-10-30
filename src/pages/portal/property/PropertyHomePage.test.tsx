import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PropertyHome } from "../../../lib/api";
import { mockFetch, renderRoute } from "../../../test/render";
import { violationRow } from "../../../test/fixtures";
import { PropertyHomePage } from "./PropertyHomePage";

const download = vi.fn();
vi.mock("../../../lib/report-pdf", () => ({ downloadReportPdf: (r: unknown) => download(r) }));

const home = (patch: Partial<PropertyHome> = {}): PropertyHome =>
  ({
    property: {
      id: "p1",
      name: "The Oaks at Decatur",
      slug: "the-oaks",
      address: "2150 Lawrenceville Hwy",
      city: "Decatur",
      county: "DeKalb",
      unitCount: 312,
      organizationId: "org1",
      organizationName: "Peachtree Residential",
      serviceStartDate: null,
      contractType: null,
      status: "active",
      photoVersion: null,
      buildingCount: 6,
      zip: "30033",
      trashOutWindow: null,
      pressureWashing: 0,
    },
    canManage: false,
    buildings: 0,
    units: 0,
    openReports: 1,
    recentReports: [],
    stats: { violations30d: 3, violationsPer100Units: 1, overwatchUnits: 1, overwatchThreshold: { count: 3, days: 30 } },
    organization: { id: "org1", name: "Peachtree Residential" },
    header: {
      address: "2150 Lawrenceville Hwy, Decatur, 30033",
      buildings: 6,
      units: 312,
      serviceNightsLabel: "Sun–Thu nights",
      trashOutWindow: "6–8 PM · pickup from 8 PM",
      pressureWashingNext: null,
      pressureWashing: false,
      startingOn: null,
    },
    kpis: { violationsToReview: 1, resolved30d: { value: 19, avgDaysToResolve: 1.4 }, openIssues: { value: 1, lastReplyHours: 3 }, serviceNights: { serviced: 3, scheduled: 3 }, repeatUnits: 1 },
    violationsToReview: [violationRow({ id: "v1", refNo: 2041, status: "sent", repeat: true, unitCount30d: 3 })],
    issues: [
      {
        id: "r1",
        refNo: 1042,
        issueLabel: "Missed pickup",
        createdAt: "2026-10-27T02:31:00Z",
        propertyId: "p1",
        propertyName: "The Oaks at Decatur",
        building: "3",
        unit: "305",
        statusLabel: "CBES replied",
        replyClock: { state: "replied", hours: 3 },
        quote: "My trash was out by 7 and is still at the door.",
      },
    ],
    repeatUnits: [{ unit: "412", building: "4", count: 3, types: "Bag not tied ×2, Set out after 8 PM" }],
    tonight: {
      isServiceNight: true,
      startsAt: "8 PM",
      steward: { id: "user_lead", name: "Dana Brooks" },
      valets: [{ id: "user_valet", name: "Marcus Hill", area: null }],
      lastNight: { date: "2026-10-27", buildingsDone: null, buildings: 6, firstClockIn: "8:02 PM", lastClockOut: "11:48 PM", violations: 2 },
    },
    team: {
      steward: { id: "user_lead", name: "Dana Brooks" },
      valets: [],
      staff: [],
      members: [{ id: "user_pm", name: "Chris Patel", role: "manager", receivesWeeklyReport: true, you: true }],
      representatives: [{ id: "user_rep", name: "Lauren Kim" }],
    },
    reportLink: { url: "https://cbenvironments.com/report?p=the-oaks" },
    ...patch,
  }) as PropertyHome;

type Extra = (url: string, method: string, body: unknown) => [number, unknown] | undefined;
const api = (data: PropertyHome | [number, unknown] = home(), extra: Extra = () => undefined) =>
  mockFetch((url, method, body) => {
    const hit = extra(url, method, body);
    if (hit) return hit;
    if (url.startsWith("/api/portal/properties/p1/report")) return [200, { property: { id: "p1" } }];
    if (url.startsWith("/api/portal/properties/p1")) return Array.isArray(data) ? data : [200, data];
    if (url === "/api/organizations/org1") return [200, { staff: [] }];
    return [404, { error: "Not found" }];
  });

const show = (url = "/portal/properties/p1") => renderRoute("/portal/properties/:propertyId", url, <PropertyHomePage />);

afterEach(() => {
  vi.unstubAllGlobals();
  download.mockClear();
});

describe("PropertyHomePage", () => {
  it("shows a skeleton while it loads", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    show();
    expect(await screen.findByRole("status", { name: "Loading" }, { timeout: 1500 })).toBeInTheDocument();
  });

  it("explains a failure and retries", async () => {
    let fail = true;
    api(home(), (url) => (url === "/api/portal/properties/p1" && fail ? [404, { error: "Not found" }] : undefined));
    show();
    expect(await screen.findByRole("alert")).toHaveTextContent("Not found");
    fail = false;
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("heading", { level: 1, name: "The Oaks at Decatur" })).toBeInTheDocument();
  });

  it("introduces the property and its service", async () => {
    vi.stubGlobal("__clerkRole", "manager");
    api();
    show();
    expect(await screen.findByRole("heading", { level: 1, name: "The Oaks at Decatur" })).toBeInTheDocument();
    expect(screen.getByText("2150 Lawrenceville Hwy, Decatur, GA 30033")).toBeInTheDocument();
    expect(screen.getByText("312 units · 6 buildings")).toBeInTheDocument();
    expect(screen.getByText("Service active · Sun–Thu nights")).toBeInTheDocument();
    expect(screen.getByText("Trash out 6–8 PM · pickup from 8 PM")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Reporting" })).toHaveAttribute("href", "/portal/reporting?scope=property&property=p1");
    expect(screen.getByRole("link", { name: /Violations to review/ })).toHaveAttribute("href", "/portal/violations?property=p1");
    expect(screen.getByText("Avg 1.4 days to resolve")).toBeInTheDocument();
    expect(screen.getByText("CBES replied in 3.0h")).toBeInTheDocument();
    expect(document.title).toBe("The Oaks at Decatur | CBES Portal");
  });

  it("says when service hasn't started", async () => {
    api(home({ header: { ...home().header, startingOn: "Nov 9" } }));
    show();
    expect(await screen.findByText("Starting Nov 9")).toBeInTheDocument();
  });

  it("lists what's waiting, the resident issues and the repeat units", async () => {
    vi.stubGlobal("__clerkRole", "manager");
    api();
    show();
    const review = await screen.findByRole("region", { name: "Violations to review" });
    expect(within(review).getByText("3rd in 30 days")).toBeInTheDocument();
    expect(within(review).getByText(/V-2041 · Bldg 4 · Unit 412 · logged .* by Marcus H\./)).toBeInTheDocument();
    expect(within(review).getByRole("link", { name: "Open V-2041" })).toHaveAttribute("href", "/portal/violations/v1");
    const issues = screen.getByRole("region", { name: "Resident issues" });
    expect(within(issues).getByText("“My trash was out by 7 and is still at the door.”")).toBeInTheDocument();
    expect(within(issues).getByText("CBES replied")).toBeInTheDocument();
    const repeat = screen.getByRole("region", { name: /Repeat units/ });
    expect(within(repeat).getByText("Bag not tied ×2, Set out after 8 PM")).toBeInTheDocument();
    expect(within(repeat).getByRole("button", { name: "Put on Overwatch · coming soon" })).toBeDisabled();
  });

  it("says when nothing's waiting, and hides repeat units when there are none", async () => {
    api(home({ violationsToReview: [], issues: [], repeatUnits: [] }));
    show();
    expect(await screen.findByText("No violations to review. Nice work.")).toBeInTheDocument();
    expect(screen.getByText(/No resident issues yet/)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /Repeat units/ })).not.toBeInTheDocument();
  });

  it("marks a violation resolved from the list, saying how", async () => {
    vi.stubGlobal("__clerkRole", "manager");
    const calls = api(home(), (_url, method) => (method === "PATCH" ? [200, { violation: {} }] : undefined));
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Mark resolved, V-2041" }));
    const pop = screen.getByRole("dialog", { name: "Mark V-2041 resolved" });
    await userEvent.click(within(pop).getByRole("button", { name: "Save" }));
    expect(within(pop).getByRole("alert")).toHaveTextContent("Choose how you handled it.");
    await userEvent.click(within(pop).getByRole("radio", { name: "Courtesy notice sent" }));
    await userEvent.click(within(pop).getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Marked resolved.")).toBeInTheDocument();
    expect(calls.find((c) => c.method === "PATCH")).toMatchObject({ url: "/api/portal/violations/v1", body: { status: "resolved", resolution: "courtesy_notice" } });
  });

  it("shows tonight's service and the team; a manager can't manage it", async () => {
    vi.stubGlobal("__clerkRole", "manager");
    api();
    show();
    const tonight = await screen.findByRole("region", { name: "Tonight's service" });
    expect(within(tonight).getByText("Starts 8 PM")).toBeInTheDocument();
    expect(within(tonight).getByText("Dana Brooks")).toBeInTheDocument();
    expect(within(tonight).getByText(/8:02 PM to 11:48 PM\. 2 violations sent to you so far\./)).toBeInTheDocument();
    const team = screen.getByRole("region", { name: "Property team" });
    expect(within(team).getByText("Property Manager (you)")).toBeInTheDocument();
    expect(within(team).getByText("Weekly report")).toBeInTheDocument();
    expect(within(team).getByText("Representative · Peachtree Residential")).toBeInTheDocument();
    expect(within(team).getByText("Managed by your Representative")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  });

  it("gives a Representative Edit and Manage", async () => {
    vi.stubGlobal("__clerkRole", "representative");
    const calls = api(home({ canManage: true }), (url, method) => (method === "PATCH" && url === "/api/organizations/org1/properties/p1" ? [200, { property: {} }] : undefined));
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
    const dialog = screen.getByRole("dialog", { name: "Edit property" });
    await userEvent.clear(within(dialog).getByLabelText("Units"));
    await userEvent.type(within(dialog).getByLabelText("Units"), "320");
    await userEvent.selectOptions(within(dialog).getByLabelText("Trash-out window"), "19:00-21:00");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Property saved.")).toBeInTheDocument();
    expect(calls.find((c) => c.method === "PATCH")?.body).toMatchObject({ name: "The Oaks at Decatur", unitCount: 320, buildingCount: 6, trashOutWindow: "19:00-21:00", pressureWashing: false });
    await userEvent.click(within(screen.getByRole("region", { name: "Property team" })).getByRole("button", { name: "Manage" }));
    expect(screen.getByRole("dialog", { name: "Managers for The Oaks at Decatur" })).toBeInTheDocument();
  });

  it("hides every change in the admin's manager preview", async () => {
    vi.stubGlobal("__clerkRole", "super_admin");
    const calls = api(home({ canManage: false }));
    show("/portal/properties/p1?as=manager");
    expect(await screen.findByRole("heading", { level: 1, name: "The Oaks at Decatur" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Mark resolved, V-2041/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Manage" })).not.toBeInTheDocument();
    expect(calls[0].url).toBe("/api/portal/properties/p1?as=manager");
  });

  it("downloads last week's report and copies the resident link", async () => {
    vi.stubGlobal("__clerkRole", "manager");
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    api();
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Last week's PDF" }));
    await waitFor(() => expect(download).toHaveBeenCalledWith({ property: { id: "p1" } }));
    const link = screen.getByRole("region", { name: "Report an Issue link" });
    expect(within(link).getByText("cbenvironments.com/report?p=the-oaks")).toBeInTheDocument();
    expect(within(link).getByRole("img", { name: "QR code for the Report an Issue link" })).toBeInTheDocument();
    await userEvent.click(within(link).getByRole("button", { name: "Copy link" }));
    expect(writeText).toHaveBeenCalledWith("https://cbenvironments.com/report?p=the-oaks");
    expect(await screen.findByText("Link copied.")).toBeInTheDocument();
  });
});
