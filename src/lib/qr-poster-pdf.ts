// The resident report poster (REP_PORTAL_SPEC 7.2): a QR code residents scan to report a problem.
// Built in the browser and loaded on demand, like the other PDFs. [placeholder] Poster copy is
// waiting on the owner (REP_PORTAL_SPEC 11, question 5).
import { jsPDF } from "jspdf";

const NAVY: [number, number, number] = [26, 28, 94];
const MUTED: [number, number, number] = [74, 76, 99];

/** `qrPng` is a PNG data URL of the QR code (jsPDF can't place SVG). */
export function buildQrPoster({ propertyName, url, qrPng }: { propertyName: string; url: string; qrPng: string }): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const width = doc.internal.pageSize.getWidth();
  const center = width / 2;
  doc.setFont("helvetica", "bold").setFontSize(34).setTextColor(...NAVY).text("Report a trash problem", center, 110, { align: "center" });
  doc.setFont("helvetica", "normal").setFontSize(16).setTextColor(...MUTED).text(propertyName, center, 145, { align: "center" });
  const size = 300;
  doc.addImage(qrPng, "PNG", center - size / 2, 190, size, size);
  doc.setFontSize(14).setTextColor(...MUTED).text("Scan with your phone's camera, or go to:", center, 540, { align: "center" });
  doc.setFont("helvetica", "bold").setFontSize(15).setTextColor(...NAVY).text(url, center, 565, { align: "center" });
  doc.setFont("helvetica", "normal").setFontSize(12).setTextColor(...MUTED);
  const lines = doc.splitTextToSize("Missed pickup, a spill, or something else? Tell us and we'll reply within 24 hours.", width - 160);
  doc.text(lines, center, 610, { align: "center" });
  return doc;
}

export function posterFileName(propertyName: string) {
  return `resident-report-qr-${propertyName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.pdf`;
}
