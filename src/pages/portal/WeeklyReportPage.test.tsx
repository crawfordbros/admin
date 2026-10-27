import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WeeklyReport } from "../../lib/api";
import { mockFetch, renderRoute } from "../../test/render";
import { WeeklyReportPage } from "./WeeklyReportPage";

const report = (start: string, overrides: Partial<WeeklyReport> = {}): WeeklyReport => ({
  property: { id: "p1", name: "Demo Community", address: "100 Demo Way", city: "Clarkston" },
  week: { start, end: "2026-10-24", label: start === "2026-10-18" ? "Oct 18–24, 2026" : "Oct 11–17, 2026" },
  generatedAt: "2026-10-27T12:00:00.000Z",
  residentReports: {
    total: 2,
    open: 1,
    resolved: 1,
    avgFirstResponseHours: 3,
    byType: [{ type: "missed_pickup", label: "Missed pickup", count: 2 }],
    items: [
      { refNo: 1001, date: "2026-10-18", issueLabel: "Missed pickup", unit: "Unit 101", status: "resolved", statusLabel: "Resolved", reporterName: "Jordan", description: null },
      { refNo: 1002, date: "2026-10-20", issueLabel: "Missed pickup", unit: null, status: "new", statusLabel: "Received", reporterName: "Casey", description: null },
    ],
  },
  stillOpen: 4,
  valetTimes: {
    status: "ok",
    shifts: 2,
    avgClockIn: "8:15 PM",
    avgClockOut: "12:00 AM",
    autoClockOuts: 0,
    nights: [{ date: "2026-10-18", valets: 1, firstClockIn: "8:00 PM", lastClockOut: "11:30 PM", stillClockedIn: false }],
  },
  ...overrides,
});

afterEach(() => vi.unstubAllGlobals());

describe("WeeklyReportPage", () => {
  it("shows the week's reports and valet times, signed in with the session token", async () => {
    const calls = mockFetch((url) => [200, report(new URL(url, "http://x").searchParams.get("week") ?? "2026-10-18")]);
    renderRoute("/portal/properties/:id/report", "/portal/properties/p1/report", <WeeklyReportPage />);

    expect(await screen.findByRole("heading", { level: 1, name: "Demo Community" })).toBeInTheDocument();
    expect(screen.getByText("Oct 18–24, 2026")).toBeInTheDocument();
    expect(screen.getByText("8:15 PM")).toBeInTheDocument();
    expect(screen.getByText("12:00 AM")).toBeInTheDocument();
    expect(screen.getByText("#1002")).toBeInTheDocument();
    expect(calls[0]).toMatchObject({ url: "/api/portal/properties/p1/report", auth: "Bearer session-token" });
  });

  it("moves between weeks", async () => {
    const calls = mockFetch((url) => [200, report(new URL(url, "http://x").searchParams.get("week") ?? "2026-10-18")]);
    renderRoute("/portal/properties/:id/report", "/portal/properties/p1/report", <WeeklyReportPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Previous week/ }));
    await screen.findByText("Oct 11–17, 2026");
    expect(calls.at(-1)?.url).toBe("/api/portal/properties/p1/report?week=2026-10-11");
    expect(screen.getByTestId("location")).toHaveTextContent("/portal/properties/p1/report?week=2026-10-11");
  });

  it("emails the report to the signed-in person and says where it went", async () => {
    const calls = mockFetch((_url, method) =>
      method === "POST" ? [200, { sentTo: "pat@demo-mgmt.com" }] : [200, report("2026-10-18")],
    );
    renderRoute("/portal/properties/:id/report", "/portal/properties/p1/report", <WeeklyReportPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Email me this report" }));
    expect(await screen.findByText("Sent to pat@demo-mgmt.com.")).toBeInTheDocument();
    expect(calls.at(-1)).toMatchObject({ url: "/api/portal/properties/p1/report/email", method: "POST", body: { week: "2026-10-18" } });
  });

  it("shows the API's error when the email can't be sent", async () => {
    mockFetch((_url, method) => (method === "POST" ? [502, { error: "We couldn't send the email." }] : [200, report("2026-10-18")]));
    renderRoute("/portal/properties/:id/report", "/portal/properties/p1/report", <WeeklyReportPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Email me this report" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't send the email.");
  });

  it("prints the page", async () => {
    mockFetch(() => [200, report("2026-10-18")]);
    const print = vi.fn();
    vi.stubGlobal("print", print);
    renderRoute("/portal/properties/:id/report", "/portal/properties/p1/report", <WeeklyReportPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Print" }));
    expect(print).toHaveBeenCalled();
  });

  it("says how many automatic clock-outs were left out", async () => {
    mockFetch(() => [
      200,
      report("2026-10-18", {
        valetTimes: {
          status: "ok",
          shifts: 2,
          avgClockIn: "8:00 PM",
          avgClockOut: null,
          autoClockOuts: 2,
          nights: [
            { date: "2026-10-18", valets: 1, firstClockIn: "8:00 PM", lastClockOut: null, stillClockedIn: false },
            { date: "2026-10-19", valets: 1, firstClockIn: "8:00 PM", lastClockOut: null, stillClockedIn: true },
          ],
        },
      }),
    ]);
    renderRoute("/portal/properties/:id/report", "/portal/properties/p1/report", <WeeklyReportPage />);
    expect(await screen.findByText(/2 automatic clock-outs \(a valet forgot to clock out\) left out/)).toBeInTheDocument();
    expect(screen.getByText("Automatic clock-out")).toBeInTheDocument();
    expect(screen.getByText("Still clocked in")).toBeInTheDocument();
  });

  it("explains missing valet times instead of showing blanks", async () => {
    mockFetch(() => [200, report("2026-10-18", { valetTimes: { status: "no_job" } })]);
    renderRoute("/portal/properties/:id/report", "/portal/properties/p1/report", <WeeklyReportPage />);
    expect(await screen.findByText(/once CBES links this property to its Connecteam job/)).toBeInTheDocument();
  });

  it("shows not-found for a property the person can't see", async () => {
    mockFetch(() => [404, { error: "Not found" }]);
    renderRoute("/portal/properties/:id/report", "/portal/properties/p2/report", <WeeklyReportPage />);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Not found"));
  });
});
