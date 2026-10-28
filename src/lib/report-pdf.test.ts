import { describe, expect, it } from "vitest";
import type { WeeklyReport, WeeklyRow } from "./api";
import { buildOrgPdf, buildReportPdf, orgFileName, reportFileName } from "./report-pdf";

const report: WeeklyReport = {
  property: { id: "p1", name: "Demo Community", address: null, city: null },
  week: { start: "2026-10-18", end: "2026-10-24", label: "Oct 18–24, 2026" },
  generatedAt: "2026-10-27T12:00:00.000Z",
  residentReports: {
    total: 1,
    open: 1,
    resolved: 0,
    avgFirstResponseHours: null,
    byType: [{ type: "missed_pickup", label: "Missed pickup", count: 1 }],
    items: [{ refNo: 1001, date: "2026-10-18", issueLabel: "Missed pickup", unit: "Unit 101", status: "new", statusLabel: "Received", reporterName: "Jordan", description: null }],
  },
  stillOpen: 1,
  valetTimes: {
    status: "ok",
    shifts: 1,
    avgClockIn: "8:00 PM",
    avgClockOut: "11:30 PM",
    autoClockOuts: 0,
    nights: [{ date: "2026-10-18", valets: 1, firstClockIn: "8:00 PM", lastClockOut: "11:30 PM", stillClockedIn: false }],
  },
};

describe("weekly report PDF", () => {
  it("builds a PDF with the property, week, reports and valet times", () => {
    const doc = buildReportPdf(report);
    const text = doc.output();
    expect(text.startsWith("%PDF-")).toBe(true);
    for (const s of ["Weekly report: Demo Community", "#1001", "Missed pickup", "8:00 PM", "11:30 PM"]) expect(text).toContain(s);
  });

  it("names the file after the property and week", () => {
    expect(reportFileName(report)).toBe("cbes-weekly-report-demo-community-2026-10-18.pdf");
  });
});

describe("organization PDF", () => {
  const row: WeeklyRow = {
    propertyId: "p1", name: "Demo Community", units: 30, city: "Clarkston", photoVersion: null,
    nights: { scheduled: 5, serviced: 5, byNight: [true, true, true, true, true] }, valetStatus: "ok", avgClockIn: "8:00 PM",
    residentReports: 1, resolved: 0, avgReplyHours: null, violations: 4, overwatchUnits: 1,
    director: null, recipients: 0, delivery: "not_sent", lastRunAt: null, lastError: null,
  };

  it("starts with a summary page, then each property on its own pages", () => {
    const one = buildReportPdf(report).getNumberOfPages();
    const doc = buildOrgPdf("Demo Management", "Oct 18–24, 2026", [row, { ...row, propertyId: "p2", name: "Willow Bend" }], [report, { ...report, property: { ...report.property, id: "p2", name: "Willow Bend" } }]);
    expect(doc.getNumberOfPages()).toBe(1 + 2 * one);
    const text = (doc.output() as string);
    expect(text).toContain("Weekly report: Demo Management");
    expect(text).toContain("Weekly report: Willow Bend");
    expect(orgFileName("Demo Management", "2026-10-18")).toBe("cbes-weekly-report-demo-management-2026-10-18.pdf");
  });
});
