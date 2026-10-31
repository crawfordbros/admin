// Courtesy notices the property sends residents about a violation (REP_PORTAL_SPEC 6.4). Built in
// the browser and loaded on demand (import()), like the weekly report PDFs. A notice never names
// the valet or anyone at CBES: it comes from the property's office.
import { jsPDF } from "jspdf";
import type { ViolationDetail } from "./api";
import { unitLabel } from "./format";

export type NoticeImage = { data: string; width: number; height: number };
export type CourtesyNotice = { v: ViolationDetail; photo: NoticeImage | null; logo: NoticeImage | null };

const NAVY: [number, number, number] = [26, 28, 94];
const INK: [number, number, number] = [26, 28, 61];
const MUTED: [number, number, number] = [74, 76, 99];
const MARGIN = 56;

const longDate = (d: Date) => d.toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric", year: "numeric" });
/** The service night a violation was logged on (before 6 AM counts as the night before). */
const nightOf = (iso: string) => new Date(Date.parse(iso) - 6 * 3_600_000);

/** Fits an image into a box, keeping its shape. */
function fit(img: NoticeImage, maxW: number, maxH: number) {
  const scale = Math.min(maxW / img.width, maxH / img.height, 1);
  return { w: img.width * scale, h: img.height * scale };
}

function writeNotice(doc: jsPDF, { v, photo, logo }: CourtesyNotice, today: Date) {
  const width = doc.internal.pageSize.getWidth();
  const text = width - MARGIN * 2;
  let y = MARGIN;

  const from = v.orgName ?? v.propertyName;
  if (logo) {
    const { w, h } = fit(logo, 140, 56);
    doc.addImage(logo.data, "JPEG", MARGIN, y, w, h);
    y += h + 14;
  } else {
    doc.setFont("helvetica", "bold").setFontSize(14).setTextColor(...NAVY).text(from, MARGIN, y + 12);
    y += 30;
  }
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(...MUTED);
  const address = [v.propertyName, v.courtesy.propertyAddress, v.courtesy.propertyCity].filter(Boolean).join(" · ");
  doc.text(address, MARGIN, y);
  y += 34;

  doc.setFont("helvetica", "bold").setFontSize(22).setTextColor(...NAVY).text("Courtesy notice", MARGIN, y);
  y += 26;
  doc.setFont("helvetica", "normal").setFontSize(11).setTextColor(...INK);
  doc.text(`To the resident of ${v.building ? `Building ${v.building}, ` : ""}${unitLabel(v.unit)}`, MARGIN, y);
  y += 16;
  doc.setTextColor(...MUTED).text(longDate(today), MARGIN, y);
  y += 28;

  // [placeholder] Final wording to come from the owner (REP_PORTAL_SPEC 11, question 5).
  const night = longDate(nightOf(v.loggedAt)).replace(/, \d{4}$/, "");
  const paragraphs = [
    `On the night of ${night}, our trash valet service noted: ${v.typeLabel.toLowerCase()} at your unit.`,
    `Please help keep ${v.propertyName} clean for everyone: tie bags closed, use your container, and set it out only during the posted trash-out window.`,
    v.courtesy.officePhone ? `Questions? Call the leasing office at ${v.courtesy.officePhone}.` : "Questions? Contact the leasing office.",
    "Thank you for your help.",
  ];
  doc.setFontSize(11.5).setTextColor(...INK);
  for (const p of paragraphs) {
    const lines = doc.splitTextToSize(p, text);
    doc.text(lines, MARGIN, y);
    y += lines.length * 16 + 10;
  }

  if (photo) {
    const room = doc.internal.pageSize.getHeight() - y - MARGIN - 40;
    if (room > 120) {
      const { w, h } = fit(photo, text, Math.min(room, 300));
      doc.addImage(photo.data, "JPEG", MARGIN, y + 6, w, h);
    }
  }

  doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(...INK).text(from, MARGIN, doc.internal.pageSize.getHeight() - MARGIN);
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...MUTED).text(`Ref V-${v.refNo}`, width - MARGIN, doc.internal.pageSize.getHeight() - MARGIN, { align: "right" });
}

/** One page per violation. */
export function buildCourtesyNotices(notices: CourtesyNotice[], today = new Date()): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  notices.forEach((n, i) => {
    if (i > 0) doc.addPage();
    writeNotice(doc, n, today);
  });
  return doc;
}
