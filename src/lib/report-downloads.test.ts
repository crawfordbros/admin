import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import type { WeeklyReport } from "./api";
import { buildOrgPdf, reportFileName } from "./report-pdf";
import { collectReports, downloadReportZip } from "./report-downloads";

const week = "2026-10-18";
const report = (id: string): WeeklyReport => ({
  property: { id, name: "Same Property", address: null, city: null },
  week: { start: week, end: "2026-10-24", label: "Oct 18–24, 2026" }, generatedAt: "2026-10-25T12:00:00Z",
  residentReports: { total: 0, open: 0, resolved: 0, avgFirstResponseHours: null, byType: [], items: [] },
  stillOpen: 0, valetTimes: { status: "not_configured" },
});
const targets = ["one", "two", "failed"].map((propertyId) => ({ propertyId, name: "Same Property" }));
let saved: Blob[];
let names: string[];
beforeEach(() => {
  saved = []; names = [];
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn((blob: Blob) => { saved.push(blob); return "blob:report"; }), revokeObjectURL: vi.fn() }));
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { names.push(this.download); });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const bytes = (blob: Blob) => new Promise<Uint8Array>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
  reader.onerror = reject;
  reader.readAsArrayBuffer(blob);
});

describe("bulk report downloads", () => {
  it("keeps same-name PDFs and adds a manifest and partial filename for failures", async () => {
    const failures = await downloadReportZip(targets, week, async (id) => {
      if (id === "failed") throw new Error("API unavailable");
      return report(id);
    });
    expect(failures).toMatchObject([{ id: "failed", label: "Same Property" }]);
    expect(names).toEqual([`cbes-weekly-reports-${week}-partial.zip`]);
    const files = unzipSync(await bytes(saved[0]));
    expect(Object.keys(files)).toEqual([reportFileName(report("one")), reportFileName(report("two")), "download-errors.txt"]);
    expect(strFromU8(files["download-errors.txt"])).toContain("2 of 3 properties included");
    expect(strFromU8(files["download-errors.txt"])).toContain("Same Property (failed)");
    expect(strFromU8(files[reportFileName(report("one"))])).toContain("%PDF-");
  });

  it("creates no archive when every report fails or the selection is empty", async () => {
    await expect(downloadReportZip(targets, week, async () => { throw new Error("offline"); })).rejects.toThrow("No reports could be downloaded");
    await expect(downloadReportZip([], week, async (id) => report(id))).rejects.toThrow("no property reports");
    expect(saved).toHaveLength(0);
  });

  it("rejects data for the wrong week or property, and counts PDF generation failures", async () => {
    const failures = await downloadReportZip([...targets, { propertyId: "broken", name: "Broken" }], week, async (id) => {
      if (id === "two") return { ...report(id), week: { ...report(id).week, start: "2026-10-11" } };
      if (id === "failed") return report("someone-else");
      if (id === "broken") return { ...report(id), residentReports: undefined } as unknown as WeeklyReport;
      return report(id);
    });
    expect(failures.map((f) => f.id)).toEqual(["two", "failed", "broken"]);
    const files = unzipSync(await bytes(saved[0]));
    expect(Object.keys(files)).toHaveLength(2);
  });

  it("collects failures without exceeding four simultaneous properties", async () => {
    let pending = 0; let peak = 0;
    const list = Array.from({ length: 10 }, (_, i) => ({ propertyId: String(i), name: String(i) }));
    const result = await collectReports(list, async (target) => {
      pending++; peak = Math.max(peak, pending);
      await new Promise((resolve) => setTimeout(resolve, 1));
      pending--;
      if (target.propertyId === "2") throw new Error("failed");
      return target.propertyId;
    });
    expect(peak).toBe(4);
    expect(result.items).toHaveLength(9);
    expect(result.failures).toHaveLength(1);
  });

  it("marks the organization PDF cover as partial with omitted property details", () => {
    const pdf = buildOrgPdf("Organization", "Oct 18–24, 2026", [], [report("one")], [{ id: "two", label: "Missing Property", message: "Report unavailable" }]);
    expect(pdf.output()).toContain("PARTIAL REPORT: 1 of 2 properties included");
    expect(pdf.output()).toContain("Missing Property");
  });
});
