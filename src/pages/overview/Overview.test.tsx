import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdminOverview, OverwatchPreview } from "../../lib/api";
import { mockFetch, renderRoute } from "../../test/render";
import { OverviewPage } from "./OverviewPage";
import { OverwatchPage } from "../overwatch/OverwatchPage";

const kpi = (value: number | null, previous: number | null, note?: string) => ({ value, previous, spark: [3, 4, 5, 4, 6, 5, value ?? 0], ...(note ? { note } : {}) });
const overview = (o: Partial<AdminOverview> = {}): AdminOverview => ({
  range: { from: "2026-10-22T04:00:00.000Z", to: "2026-10-28T23:00:00.000Z", label: "Last 7 days" },
  kpis: {
    openReports: kpi(7, 9),
    avgFirstReplyHours: kpi(5.8, 6.4),
    violations: kpi(41, 35),
    overwatchUnits: { value: 5, previous: null, spark: [], note: "Phase 2 preview" },
    newQuotes: kpi(3, null, "1 waiting over 24h"),
  },
  activity: ["2026-09-06", "2026-09-13", "2026-09-20", "2026-09-27", "2026-10-04", "2026-10-11", "2026-10-18", "2026-10-25"].map((weekStart, i) => ({ weekStart, violations: 30 + i, residentReports: 12 })),
  attention: [
    { kind: "report_due", title: "Issue #1042 · Missed pickup", subtitle: "The Oaks at Decatur · Unit 305", tag: "3h left on 24h", severity: "high", link: "/admin/issues/r1", at: "2026-10-27T23:00:00Z" },
    { kind: "violations_to_review", title: "6 violations awaiting review", subtitle: "Logged, not yet sent to properties", tag: "Review", severity: "medium", link: "/admin/violations?stage=new", at: "2026-10-28T02:00:00Z" },
  ],
  service: { tonight: true, date: "2026-10-28", holidayName: null, startTime: "20:00", nextServiceNight: null, valetStatus: "ok", clockedIn: 2, total: 3 },
  tonight: [
    { propertyId: "p1", orgId: "o1", name: "The Oaks at Decatur", orgName: "Peachtree Residential", stewardName: "Dana B.", progressPct: null, status: "done" },
    { propertyId: "p2", orgId: "o1", name: "Brookhaven Terrace", orgName: "Peachtree Residential", stewardName: null, progressPct: null, status: "in_progress" },
    { propertyId: "p3", orgId: "o2", name: "Lakeside Crossing", orgName: "Magnolia Living", stewardName: "Dana B.", progressPct: null, status: "no_clock_in" },
  ],
  orgs: [{ id: "o1", name: "Peachtree Residential", logoVersion: null, properties: 6, openReports: 3, violations30d: 58, avgReplyHours: 4.9 }],
  ...o,
});

afterEach(() => vi.unstubAllGlobals());

describe("OverviewPage", () => {
  it("shows the KPIs, what needs attention, tonight's service and organizations", async () => {
    mockFetch((url) => (url.startsWith("/api/admin/overview") ? [200, overview()] : [404, {}]));
    renderRoute("/admin", "/admin", <OverviewPage />);

    expect(await screen.findByText("Tonight is a service night. 2 of 3 properties have a valet clocked in.")).toBeInTheDocument();
    const open = screen.getByRole("link", { name: /Open resident issues/ });
    expect(open).toHaveAttribute("href", "/admin/issues?tab=open&dates=all");
    expect(screen.getByRole("link", { name: /Violations, 7 days/ })).toHaveAttribute("href", "/admin/violations?stage=all&dates=7d");
    expect(open).toHaveTextContent("−2 vs the previous 7 days");
    expect(screen.getByRole("link", { name: /Violations, 7 days/ })).toHaveTextContent("+6 vs the previous 7 days");
    expect(screen.getByRole("link", { name: /Overwatch units/ })).toHaveTextContent("Phase 2 preview");
    expect(screen.getByRole("link", { name: /New quote requests/ })).toHaveTextContent("1 waiting over 24h");

    expect(screen.getByRole("link", { name: /Issue #1042 · Missed pickup/ })).toHaveAttribute("href", "/admin/issues/r1");

    const tonight = screen.getByRole("heading", { name: "Tonight's service" }).closest("section")!;
    expect(within(tonight).getByText("Live from Connecteam")).toBeInTheDocument();
    const rows = within(tonight).getAllByRole("listitem");
    // Properties without a clock-in come first.
    expect(rows[0]).toHaveTextContent("Lakeside Crossing");
    expect(rows[0]).toHaveTextContent("No clock-in");
    expect(rows[1]).toHaveTextContent("No Steward assigned");
    expect(within(tonight).getByRole("link", { name: /^The Oaks at Decatur/ })).toHaveAttribute("href", "/admin/organizations/o1/properties/p1");

    const orgs = screen.getByRole("table", { name: "Organizations at a glance" });
    expect(within(orgs).getByRole("link", { name: /Peachtree Residential/ })).toHaveAttribute("href", "/admin/organizations/o1");
    expect(orgs).toHaveTextContent("4.9h");
  });

  it("keeps the range in the URL and reloads for it", async () => {
    const calls = mockFetch((url) => (url.startsWith("/api/admin/overview") ? [200, overview()] : [404, {}]));
    renderRoute("/admin", "/admin", <OverviewPage />);
    await screen.findByText(/Tonight is a service night/);
    await userEvent.click(screen.getByRole("button", { name: "30 days" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/admin?range=30d"));
    await waitFor(() => expect(calls.some((c) => c.url === "/api/admin/overview?range=30d")).toBe(true));
  });

  it("says when there's no service tonight", async () => {
    mockFetch(() => [200, overview({ service: { tonight: false, date: "2026-10-30", holidayName: null, startTime: "20:00", nextServiceNight: "2026-11-01", valetStatus: "ok", clockedIn: 0, total: 3 }, attention: [] })]);
    renderRoute("/admin", "/admin", <OverviewPage />);
    expect(await screen.findByText("No service tonight. Next service night: Sunday.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "No service tonight" })).toBeInTheDocument();
    expect(screen.getByText("Nothing is waiting on you right now.")).toBeInTheDocument();
    expect(screen.queryByText("Live from Connecteam")).not.toBeInTheDocument();
  });

  it("explains when Connecteam isn't connected", async () => {
    mockFetch(() => [200, overview({ service: { ...overview().service, valetStatus: "not_configured" } })]);
    renderRoute("/admin", "/admin", <OverviewPage />);
    expect(await screen.findByText("Valet clock-in times will appear once Connecteam is connected.")).toBeInTheDocument();
  });
});

const preview: OverwatchPreview = {
  threshold: { count: 3, days: 30, countDismissed: false },
  units: [{ propertyId: "p1", propertyName: "The Oaks at Decatur", orgId: "o1", orgName: "Peachtree", unit: "412", count: 4, mostCommon: "Bag not tied", lastAt: "2026-10-20T01:00:00Z" }],
};

describe("OverwatchPage", () => {
  it("previews the flagged units read-only", async () => {
    mockFetch((url) => (url === "/api/admin/overwatch/preview" ? [200, preview] : [404, {}]));
    renderRoute("/admin/overwatch", "/admin/overwatch", <OverwatchPage />);
    expect(await screen.findByRole("link", { name: "Threshold: 3 in 30 days Edit" })).toHaveAttribute("href", "/admin/settings#overwatch");
    expect(screen.getByRole("button", { name: "Create Overwatch case" })).toBeDisabled();
    const row = screen.getByRole("row", { name: /412/ });
    expect(row).toHaveTextContent("The Oaks at Decatur");
    expect(row).toHaveTextContent("Peachtree");
    expect(row).toHaveTextContent("Street address missing");
    expect(row).toHaveTextContent("4");
    expect(row).toHaveTextContent("Bag not tied");
    expect(within(row).getByRole("link", { name: "412" })).toHaveAttribute("href", "/admin/violations?stage=all&property=p1&q=412");
    expect(screen.getByRole("columnheader", { name: "Violations in 30 days" })).toBeInTheDocument();
  });

  it("says when no unit is at the threshold", async () => {
    mockFetch(() => [200, { ...preview, units: [] }]);
    renderRoute("/admin/overwatch", "/admin/overwatch", <OverwatchPage />);
    expect(await screen.findByText("No unit has 3 or more violations in the last 30 days.")).toBeInTheDocument();
  });
});
