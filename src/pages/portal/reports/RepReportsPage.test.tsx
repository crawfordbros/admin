import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PortalReportSummary } from "../../../lib/api";
import { addDays, nyToday } from "../../../lib/format";
import { mockFetch, renderRoute } from "../../../test/render";
import { RepContextProvider } from "../../../components/portal/RepContext";
import { RepReportsPage } from "./RepReportsPage";

const pdf = vi.hoisted(() => ({ save: vi.fn(), build: vi.fn(), download: vi.fn() }));
vi.mock("../../../lib/report-pdf", () => ({
  buildOrgPdf: (...args: unknown[]) => (pdf.build(...args), { save: pdf.save }),
  orgFileName: (name: string, week: string) => `org-${name}-${week}.pdf`,
  downloadReportPdf: (r: unknown) => pdf.download(r),
  buildReportPdf: () => ({ output: () => new ArrayBuffer(1) }),
  reportFileName: (r: { property: { id: string } }) => `${r.property.id}.pdf`,
}));
vi.mock("fflate", () => ({ zipSync: () => new Uint8Array(1), strToU8: (text: string) => new TextEncoder().encode(text) }));

const today = nyToday();
const NEWEST = addDays(today, -new Date(`${today}T12:00:00Z`).getUTCDay() - 7);
const prop = (id: string, name: string) => ({ id, name, slug: id, city: null, organizationId: "org1", organizationName: "Peachtree Residential", photoVersion: null });
const repMe = {
  user: { id: "u1", email: "lauren@peachtree.com", name: "Lauren Kim", role: "representative" },
  organizations: [{ id: "org1", name: "Peachtree Residential", propertyCount: 2, propertyLimit: 100, logoVersion: null }],
  properties: [prop("p1", "The Oaks at Decatur"), prop("p2", "Brookhaven Terrace")],
};
const managerMe = { user: { id: "u2", email: "chris@peachtree.com", name: "Chris Patel", role: "manager" }, organizations: [], properties: [{ ...prop("p1", "The Oaks at Decatur"), memberRole: "manager" }] };

const row = (id: string, name: string) => ({
  propertyId: id,
  name,
  nights: { scheduled: 5, serviced: 5, byNight: [true, true, true, true, true], dates: [] },
  avgClockIn: "8:05 PM",
  residentReports: 1,
  resolved: 1,
  avgReplyHours: 3.2,
  violations: 7,
  overwatchUnits: 2,
  manager: { name: "Chris Patel", email: "chris@peachtree.com" },
  startsOn: null,
});

const summary = (patch: Partial<PortalReportSummary> = {}): PortalReportSummary => ({
  scope: { kind: "organization", id: "org1", name: "Peachtree Residential" },
  week: { start: NEWEST, end: addDays(NEWEST, 6), label: "Oct 18–24, 2026" },
  kpis: {
    serviceNights: { serviced: 25, scheduled: 25, activeProperties: 5 },
    violationsSent: { value: 19, previous: 25 },
    resolvedByProperty: { value: 16, pct: 84 },
    residentIssues: { value: 4, previous: 3 },
    avgFirstReplyHours: { value: 4.1, allUnder24h: true },
    compliments: 2,
  },
  trend: Array.from({ length: 8 }, (_, i) => ({ weekStart: addDays(NEWEST, -7 * (7 - i)), sent: 20 + i, resolvedByProperty: 15 + i })),
  byType: [
    { label: "Bag not tied", count: 7 },
    { label: "Set out after 8 PM", count: 5 },
  ],
  issuesSummary: "4 issues: Missed pickup (2), Spill (1), Damaged container (1). All replied to within 24 hours (avg 4.1h).",
  byProperty: [
    { propertyId: "p1", name: "The Oaks at Decatur", managerName: "Chris Patel", nights: "5 of 5", violations: 7, resolved: 6, issues: 1, avgReplyHours: 3.2, repeatUnits: 2 },
    { propertyId: "p2", name: "North Druid Flats", managerName: null, nights: "Starts Nov 9", violations: 0, resolved: 0, issues: 0, avgReplyHours: null, repeatUnits: 0 },
  ],
  rows: [row("p1", "The Oaks at Decatur"), row("p2", "North Druid Flats")],
  recipients: [
    { name: "Lauren Kim", scope: "Organization" },
    { name: "Chris Patel", scope: "2 properties" },
  ],
  nextRunAt: "2026-11-02T12:00:00.000Z",
  ...patch,
});

type Extra = (url: string, method: string, body: unknown) => [number, unknown] | undefined;
const api = (me: unknown = repMe, data: PortalReportSummary | [number, unknown] = summary(), extra: Extra = () => undefined) =>
  mockFetch((url, method, body) => {
    const hit = extra(url, method, body);
    if (hit) return hit;
    if (url === "/api/portal/me") return [200, me];
    if (url.startsWith("/api/portal/reports/summary")) return Array.isArray(data) ? data : [200, data];
    if (url.startsWith("/api/portal/reports/history")) return [200, { items: [{ weekStart: NEWEST, sentAt: "2026-10-26T11:00:00.000Z", recipients: 5, status: "sent" }] }];
    if (url.startsWith("/api/portal/properties/")) return [200, { property: { id: url.split("/")[4] }, week: { start: new URL(url, "http://x").searchParams.get("week") } }];
    return [404, { error: "Not found" }];
  });

const show = (url = "/portal/reporting?scope=organization&org=org1") =>
  renderRoute(
    "/portal/reporting",
    url,
    <RepContextProvider>
      <RepReportsPage />
    </RepContextProvider>,
  );
const summaryCalls = (calls: { url: string }[]) => calls.filter((c) => c.url.startsWith("/api/portal/reports/summary")).map((c) => new URL(c.url, "http://x").searchParams);

beforeEach(() => vi.stubGlobal("__clerkRole", "representative"));
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  pdf.save.mockClear();
  pdf.build.mockClear();
  pdf.download.mockClear();
});

describe("RepReportsPage", () => {
  it("shows the organization's week with the same numbers as the Monday email", async () => {
    api();
    show();
    expect((await screen.findAllByText("Week of Oct 18–24, 2026")).length).toBeGreaterThan(0);
    expect(screen.getByText("6 fewer than last week")).toHaveClass("text-success");
    expect(screen.getByText("1 more than last week")).toHaveClass("text-danger");
    expect(screen.getByText("84% of sent")).toBeInTheDocument();
    expect(screen.getByText("All under 24 hours")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Violations sent and resolved by the property/ })).toBeInTheDocument();
    expect(screen.getByText(/4 issues: Missed pickup \(2\)/)).toBeInTheDocument();
    expect(document.title).toBe("Reporting | CBES Portal");
  });

  it("breaks the organization down by property, with totals", async () => {
    api();
    show();
    const table = within(await screen.findByRole("region", { name: "By property" }));
    expect(table.getByText("PM Chris Patel")).toBeInTheDocument();
    expect(table.getByText("Starts Nov 9")).toBeInTheDocument();
    const totals = table.getByText("All properties").closest("tr")!;
    expect(within(totals).getByText("25 of 25")).toBeInTheDocument();
    expect(within(totals).getAllByText("7")).toHaveLength(1);
    expect(table.getByRole("link", { name: "Open The Oaks at Decatur" })).toHaveAttribute("href", "/portal/properties/p1");
  });

  it("steps through weeks, never past the newest", async () => {
    const calls = api();
    show();
    await screen.findAllByText("Week of Oct 18–24, 2026");
    expect(screen.getByRole("button", { name: "Next week" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Previous week" }));
    expect(screen.getByTestId("location")).toHaveTextContent(`week=${addDays(NEWEST, -7)}`);
    await waitFor(() => expect(summaryCalls(calls).at(-1)!.get("week")).toBe(addDays(NEWEST, -7)));
  });

  it("switches a Representative to one property", async () => {
    const calls = api();
    show();
    await screen.findAllByText("Week of Oct 18–24, 2026");
    await userEvent.click(screen.getByRole("button", { name: "One property" }));
    await waitFor(() => expect(Object.fromEntries(summaryCalls(calls).at(-1)!)).toMatchObject({ scope: "property", property: "p1" }));
    expect(screen.queryByRole("button", { name: "All properties (ZIP)" })).not.toBeInTheDocument();
  });

  it("downloads the organization PDF from the trimmed rows, and the ZIP", async () => {
    const created = vi.fn(() => "blob:zip");
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: created, revokeObjectURL: vi.fn() }));
    api();
    show();
    await screen.findAllByText("Week of Oct 18–24, 2026");
    await userEvent.click(screen.getByRole("button", { name: "Download PDF" }));
    await waitFor(() => expect(pdf.save).toHaveBeenCalledWith(`org-Peachtree Residential-${NEWEST}.pdf`));
    expect(pdf.build.mock.calls[0][0]).toBe("Peachtree Residential");
    expect(pdf.build.mock.calls[0][2]).toEqual(summary().rows);
    await userEvent.click(screen.getByRole("button", { name: "All properties (ZIP)" }));
    await waitFor(() => expect(created).toHaveBeenCalled());
  });

  it("emails the report to me", async () => {
    const calls = api(repMe, summary(), (url) => (url === "/api/portal/reports/email-me" ? [200, { sentTo: "lauren@peachtree.com" }] : undefined));
    show();
    await screen.findAllByText("Week of Oct 18–24, 2026");
    await userEvent.click(screen.getByRole("button", { name: "Email me" }));
    expect(await screen.findByText("Sent to lauren@peachtree.com.")).toBeInTheDocument();
    expect(calls.find((c) => c.url === "/api/portal/reports/email-me")?.body).toEqual({ scope: "organization", id: "org1", week: NEWEST });
  });

  it("lists past Monday reports and who gets the next one", async () => {
    api();
    show();
    const history = within(await screen.findByRole("region", { name: "Past reports" }));
    expect(await history.findByText(/to 5 people/)).toBeInTheDocument();
    const recipients = within(screen.getByRole("region", { name: "Who receives weekly reports" }));
    expect(recipients.getByText("Lauren Kim")).toBeInTheDocument();
    expect(recipients.getByText(/Next send: Monday, Nov 2 at 7 AM ET/)).toBeInTheDocument();
    expect(recipients.getByRole("link", { name: "Change in Team and settings" })).toHaveAttribute("href", "/portal/organizations/org1/settings");
  });

  it("gives a manager their property only", async () => {
    vi.stubGlobal("__clerkRole", "manager");
    const calls = api(managerMe, summary({ scope: { kind: "property", id: "p1", name: "The Oaks at Decatur" }, byProperty: [] }));
    show("/portal/reporting");
    await screen.findAllByText("Week of Oct 18–24, 2026");
    expect(screen.queryByRole("button", { name: "Organization" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "By property" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Change in Team and settings" })).not.toBeInTheDocument();
    expect(Object.fromEntries(summaryCalls(calls).at(-1)!)).toMatchObject({ scope: "property", property: "p1" });
    await userEvent.click(screen.getByRole("button", { name: "Download PDF" }));
    await waitFor(() => expect(pdf.download).toHaveBeenCalledWith({ property: { id: "p1" }, week: { start: NEWEST } }));
    expect(within(screen.getByRole("region", { name: "Past reports" })).getByRole("link", { name: /View the week/ })).toHaveAttribute("href", `/portal/properties/p1/report?week=${NEWEST}`);
  });

  it("explains a failure", async () => {
    api(repMe, [500, { error: "Reports are unavailable." }]);
    show();
    expect(await screen.findByRole("alert")).toHaveTextContent("Reports are unavailable.");
  });
});


it("shows a history failure separately from an empty history and retries", async () => {
  let failed = true;
  api(repMe, summary(), (url) => url.includes("/history") && failed ? [500, { error: "Unavailable" }] : undefined);
  show();
  expect(await screen.findByRole("button", { name: "Retry history" })).toBeInTheDocument();
  expect(screen.queryByText(/No report history yet/)).not.toBeInTheDocument();
  failed = false;
  await userEvent.click(screen.getByRole("button", { name: "Retry history" }));
  expect(await screen.findByText(/to 5 people/)).toBeInTheDocument();
});

it("does not email or export the old organization when property scope fails", async () => {
  api(repMe, summary(), (url) => url.includes("/summary?scope=property") ? [500, { error: "Property reporting unavailable" }] : undefined);
  show();
  await screen.findByRole("region", { name: "By property" });
  await userEvent.click(screen.getByRole("button", { name: "One property" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Property reporting unavailable");
  expect(screen.getByRole("button", { name: "Email me" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Download PDF" })).toBeDisabled();
  expect(screen.queryByRole("region", { name: "By property" })).not.toBeInTheDocument();
});
