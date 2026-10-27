import { describe, expect, it } from "vitest";
import type { WeeklyReport } from "./api";
import { buildReportPdf, reportFileName } from "./report-pdf";

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
