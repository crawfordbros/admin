import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WeeklyAdminView, WeeklyRow } from "../../lib/api";
import { addDays } from "../../lib/format";
import { lastCompletedWeek } from "../../lib/dates";
import { mockFetch, renderRoute } from "../../test/render";
import { WeeklyReportsPage } from "./WeeklyReportsPage";

const pdf = vi.hoisted(() => ({ buildOrgPdf: vi.fn(() => ({ save: vi.fn() })) }));
vi.mock("../../lib/report-pdf", () => ({ buildOrgPdf: pdf.buildOrgPdf, orgFileName: () => "org.pdf", downloadReportPdf: vi.fn(), buildReportPdf: vi.fn(), reportFileName: () => "r.pdf" }));

const row = (o: Partial<WeeklyRow>): WeeklyRow => ({
  propertyId: "p1", name: "The Oaks at Decatur", units: 312, city: "Decatur", photoVersion: null,
  nights: { scheduled: 5, serviced: 4, byNight: [true, true, false, true, true] }, valetStatus: "ok", avgClockIn: "8:06 PM",
  residentReports: 5, resolved: 4, avgReplyHours: 4.1, violations: 22, overwatchUnits: 2,
  director: { name: "Tom Reyes", email: "t.reyes@peachtreeres.com" }, recipients: 1, delivery: "sent", lastRunAt: "2026-10-26T11:00:00Z", lastError: null, ...o,
});
const view = (week = lastCompletedWeek()): WeeklyAdminView => ({
  week: { start: week, end: addDays(week, 6), label: "Sun Oct 18 – Sat Oct 24, 2026" },
  summary: { properties: 3, sent: 1, failed: 1, residentReports: 9, violations: 30, noDirector: 1 },
  groups: [
    { org: { id: "org1", name: "Peachtree Residential", logoVersion: null, representative: "Lauren Kim", rollupSentAt: null }, rows: [row({}), row({ propertyId: "p2", name: "Brookhaven Terrace", delivery: "failed", lastError: "Mailbox full", director: { name: "Renee Ford", email: "r@x" } })] },
    { org: { id: "org2", name: "Magnolia Living", logoVersion: null, representative: null, rollupSentAt: null }, rows: [row({ propertyId: "p3", name: "Tucker Station", director: null, recipients: 0, delivery: "not_sent" })] },
  ],
});

function handler(url: string, method: string): [number, unknown] {
  if (url.startsWith("/api/admin/weekly-reports?week=")) return [200, view(new URL(url, "http://x").searchParams.get("week")!)];
  if (url === "/api/admin/weekly-reports/next-run") return [200, { at: "2026-11-02T12:00:00Z", covers: { start: "2026-10-25", end: "2026-10-31" } }];
  if (url.startsWith("/api/admin/weekly-reports/recipients")) {
    const scope = new URL(url, "http://x").searchParams.get("scope");
    return [200, scope === "all"
      ? { recipients: [{ email: "t.reyes@peachtreeres.com", name: "Tom Reyes", kind: "director", propertyName: "The Oaks at Decatur" }, { email: "nick@cbenvironments.com", name: "Nick Crawford", kind: "admin", propertyName: null }], skippedNoDirector: ["Tucker Station"] }
      : { recipients: [{ email: "t.reyes@peachtreeres.com", name: "Tom Reyes", kind: "director", propertyName: "The Oaks at Decatur" }], skippedNoDirector: [] }];
  }
  if (url === "/api/admin/weekly-reports/send" && method === "POST") return [200, { sent: 1, failed: 0, recipients: 1, skippedNoDirector: [] }];
  return [404, { error: "Not found" }];
}

const show = (url = "/admin/weekly-reports") => renderRoute("/admin/weekly-reports", url, <WeeklyReportsPage />);

afterEach(() => vi.unstubAllGlobals());

describe("WeeklyReportsPage", () => {
  it("shows each organization's properties for last week", async () => {
    const calls = mockFetch(handler);
    show();
    const oaks = (await screen.findByText("The Oaks at Decatur")).closest("tr")!;
    expect(oaks).toHaveTextContent("4/5");
    expect(oaks).toHaveTextContent("5 (4 resolved)");
    expect(oaks).toHaveTextContent("2 units");
    expect(oaks).toHaveTextContent("Tom Reyes");
    expect(within(oaks).getByRole("img", { name: "4 of 5 nights serviced" })).toBeInTheDocument();
    expect(within(oaks).getByRole("link", { name: /Preview The Oaks at Decatur report/ })).toHaveAttribute("href", `/portal/properties/p1/report?week=${lastCompletedWeek()}`);
    expect(screen.getByRole("heading", { name: "Peachtree Residential" }).closest("section")).toHaveTextContent("Representative Lauren Kim");
    expect((screen.getByText("Tucker Station")).closest("tr")).toHaveTextContent("No Director");
    expect(screen.getByText(/1 property has no Management Director to receive the report/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Fix recipient" })).toHaveAttribute("href", "/admin/organizations/org1/properties/p2?tab=team");
    expect(screen.getByText(/Next run: Monday, November 2/)).toBeInTheDocument();
    expect(calls[0].url).toBe(`/api/admin/weekly-reports?week=${lastCompletedWeek()}`);
  });

  it("moves between weeks but never into the future", async () => {
    const calls = mockFetch(handler);
    show();
    expect(await screen.findByRole("button", { name: "Next week" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Previous week" }));
    const earlier = addDays(lastCompletedWeek(), -7);
    expect(screen.getByTestId("location")).toHaveTextContent(`week=${earlier}`);
    await waitFor(() => expect(calls.some((c) => c.url.endsWith(`week=${earlier}`))).toBe(true));
    expect(screen.getByRole("button", { name: "Next week" })).toBeEnabled();
  });

  it("builds the organization PDF from all its properties, whatever the search hides", async () => {
    mockFetch((url, method) => (url.startsWith("/api/portal/properties/") ? [200, { property: { id: "x" } }] : handler(url, method)));
    show("/admin/weekly-reports?q=oaks");
    const group = (await screen.findByRole("heading", { name: "Peachtree Residential" })).closest("section")!;
    expect(within(group).queryByText("Brookhaven Terrace")).not.toBeInTheDocument();
    await userEvent.click(within(group).getByRole("button", { name: "Org PDF" }));
    await waitFor(() => expect(pdf.buildOrgPdf).toHaveBeenCalled());
    const rows = (pdf.buildOrgPdf.mock.calls[0] as unknown[])[2] as { name: string }[];
    expect(rows.map((r) => r.name)).toEqual(["The Oaks at Decatur", "Brookhaven Terrace"]);
  });

  it("filters to failed deliveries", async () => {
    mockFetch(handler);
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Failed 1" }));
    expect(screen.getByText("Brookhaven Terrace")).toBeInTheDocument();
    expect(screen.queryByText("The Oaks at Decatur")).not.toBeInTheDocument();
  });

  it("confirms who gets a property's report before sending it again", async () => {
    const calls = mockFetch(handler);
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Send The Oaks at Decatur report again" }));
    const dialog = screen.getByRole("dialog", { name: "Send The Oaks at Decatur's report" });
    expect(await within(dialog).findByText("Tom Reyes")).toBeInTheDocument();
    expect(calls.some((c) => c.url.includes("/send"))).toBe(false);
    await userEvent.click(within(dialog).getByRole("button", { name: "Send to 1 person" }));
    expect(await screen.findByText("Sent to 1 person.")).toBeInTheDocument();
    expect(calls.find((c) => c.url.endsWith("/send"))?.body).toEqual({ week: lastCompletedWeek(), scope: "property", id: "p1" });
  });

  it("warns which properties a send-all skips", async () => {
    mockFetch(handler);
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Send all again" }));
    const dialog = screen.getByRole("dialog", { name: "Send every report again" });
    expect(await within(dialog).findByText("Skipped, no Management Director: Tucker Station")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Send to 2 people" })).toBeEnabled();
  });
});
