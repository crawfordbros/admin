import type { WeeklyReport } from "./api";
import type { OrgPdfRow } from "./report-pdf";

export type ReportTarget = { propertyId: string; name: string };
export type DownloadFailure = { id: string; label: string; message: string };
type LoadReport = (id: string, week: string) => Promise<WeeklyReport>;

/** Capture the caller's targets and week; finish healthy properties even when another one fails. */
export async function collectReports<T>(targets: ReportTarget[], work: (target: ReportTarget) => Promise<T>, progress?: (done: number) => void) {
  const items: { target: ReportTarget; value: T }[] = [];
  const failures: DownloadFailure[] = [];
  for (let i = 0; i < targets.length; i += 4) {
    const batch = targets.slice(i, i + 4);
    const results = await Promise.allSettled(batch.map((target) => Promise.resolve().then(() => work(target))));
    results.forEach((result, index) => {
      const target = batch[index];
      if (result.status === "fulfilled") items.push({ target, value: result.value });
      else failures.push({ id: target.propertyId, label: target.name, message: "The report could not be downloaded or generated. Try again." });
    });
    progress?.(Math.min(i + 4, targets.length));
  }
  if (!items.length) throw new Error(targets.length ? "No reports could be downloaded. Please try again." : "There are no property reports to download.");
  return { items, failures };
}

async function checkedReport(load: LoadReport, target: ReportTarget, week: string) {
  const report = await load(target.propertyId, week);
  if (report.property.id !== target.propertyId || report.week.start !== week) throw new Error("Report context changed");
  return report;
}

function save(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function downloadReportZip(targets: ReportTarget[], week: string, load: LoadReport, progress?: (done: number) => void) {
  const [{ buildReportPdf, reportFileName }, { zipSync, strToU8 }] = await Promise.all([import("./report-pdf"), import("fflate")]);
  const { items, failures } = await collectReports(targets, async (target) => {
    const report = await checkedReport(load, target, week);
    return { name: reportFileName(report), bytes: new Uint8Array(buildReportPdf(report).output("arraybuffer")) };
  }, progress);
  const files = Object.fromEntries(items.map(({ value }) => [value.name, value.bytes]));
  if (failures.length) files["download-errors.txt"] = strToU8(`Partial weekly report download for ${week}\n${items.length} of ${targets.length} properties included.\n\n` + failures.map((f) => `${f.label} (${f.id}): ${f.message}`).join("\n"));
  save(new Blob([zipSync(files) as BlobPart], { type: "application/zip" }), `cbes-weekly-reports-${week}${failures.length ? "-partial" : ""}.zip`);
  return failures;
}

export async function downloadOrganizationReport(name: string, label: string, rows: (ReportTarget & OrgPdfRow)[], week: string, load: LoadReport) {
  const { buildOrgPdf, buildReportPdf, orgFileName } = await import("./report-pdf");
  const { items, failures } = await collectReports(rows, async (target) => {
    const report = await checkedReport(load, target, week);
    // Validate each property's PDF before composing the organization document.
    buildReportPdf(report);
    return report;
  });
  const included = new Set(items.map((i) => i.target.propertyId));
  buildOrgPdf(name, label, rows.filter((r) => included.has(r.propertyId)), items.map((i) => i.value), failures)
    .save(orgFileName(name, week).replace(/\.pdf$/, `${failures.length ? "-partial" : ""}.pdf`));
  return failures;
}
