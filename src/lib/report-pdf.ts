// Builds the weekly report PDF in the browser. Loaded on demand (import()) so jsPDF only downloads
// when someone clicks "Download PDF".
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import type { WeeklyReport } from "./api";
import { VALET_STATUS_TEXT, formatDay, hours } from "./format";

const NAVY: [number, number, number] = [39, 43, 132];
const MUTED: [number, number, number] = [74, 76, 99];
const MARGIN = 48;

export function reportFileName(r: WeeklyReport): string {
  const slug = r.property.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `cbes-weekly-report-${slug}-${r.week.start}.pdf`;
}

export function buildReportPdf(r: WeeklyReport): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const width = doc.internal.pageSize.getWidth();
  let y = MARGIN;
  const lastY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  const heading = (text: string) => {
    if (y > doc.internal.pageSize.getHeight() - 120) {
      doc.addPage();
      y = MARGIN;
    }
    doc.setFont("helvetica", "bold").setFontSize(14).setTextColor(...NAVY).text(text, MARGIN, y);
    y += 10;
  };
  const note = (text: string) => {
    doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(...MUTED);
    const lines = doc.splitTextToSize(text, width - MARGIN * 2);
    doc.text(lines, MARGIN, y + 12);
    y += 12 + lines.length * 13 + 12;
  };
  const table = (head: string[], body: (string | number)[][]) => {
    autoTable(doc, {
      startY: y,
      head: [head],
      body,
      margin: { left: MARGIN, right: MARGIN },
      styles: { font: "helvetica", fontSize: 10, cellPadding: 5, textColor: [26, 28, 61] },
      headStyles: { fillColor: NAVY, textColor: 255 },
      alternateRowStyles: { fillColor: [248, 248, 248] },
    });
    y = lastY() + 24;
  };

  doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(122, 106, 80).text("CB ENVIRONMENT SOLUTIONS", MARGIN, y);
  y += 24;
  doc.setFontSize(20).setTextColor(...NAVY).text(`Weekly report: ${r.property.name}`, MARGIN, y);
  y += 18;
  doc.setFont("helvetica", "normal").setFontSize(11).setTextColor(...MUTED).text(r.week.label, MARGIN, y);
  y += 30;

  const rr = r.residentReports;
  heading("Resident reports");
  table(
    ["This week", "Open", "Resolved", "Avg first reply", "Open overall"],
    [[rr.total, rr.open, rr.resolved, hours(rr.avgFirstResponseHours), r.stillOpen]],
  );
  if (rr.byType.length) table(["Issue", "Reports"], rr.byType.map((t) => [t.label, t.count]));
  if (rr.items.length) {
    table(
      ["Ref", "Date", "Issue", "Unit", "Status"],
      rr.items.map((i) => [`#${i.refNo}`, formatDay(i.date), i.issueLabel, i.unit ?? "—", i.statusLabel]),
    );
  } else {
    note("No resident reports this week.");
  }

  heading("Valet service times");
  const v = r.valetTimes;
  if (v.status !== "ok") {
    note(VALET_STATUS_TEXT[v.status]);
  } else if (!v.shifts) {
    note("No valet shifts recorded this week.");
  } else {
    table(
      ["Average clock-in", "Average clock-out", "Nights serviced", "Shifts"],
      [[v.avgClockIn ?? "—", v.avgClockOut ?? "—", v.nights.length, v.shifts]],
    );
    table(
      ["Night", "Valets", "First in", "Last out"],
      v.nights.map((n) => [formatDay(n.date), n.valets, n.firstClockIn, n.lastClockOut ?? "Still clocked in"]),
    );
  }

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc
      .setFont("helvetica", "normal")
      .setFontSize(9)
      .setTextColor(...MUTED)
      .text(`CB Environment Solutions · (470) 585-2776 · office@cbenvironments.com · Page ${p} of ${pages}`, MARGIN, doc.internal.pageSize.getHeight() - 28);
  }
  return doc;
}

export function downloadReportPdf(r: WeeklyReport) {
  buildReportPdf(r).save(reportFileName(r));
}
