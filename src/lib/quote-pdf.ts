// The branded quote PDF (ADMIN_PORTAL_SPEC 8.5), built in the browser and stored on the quote as a
// document. Loaded on demand like the weekly report PDFs.
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import type { QuoteDetail, QuoteTerm } from "./api";

const NAVY: [number, number, number] = [26, 28, 94];
const GOLD: [number, number, number] = [146, 128, 100];
const MUTED: [number, number, number] = [74, 76, 99];
const MARGIN = 48;

const TERMS: Record<QuoteTerm, string> = {
  "12_month": "12-month agreement, renews automatically",
  "36_month": "36-month agreement",
  month_to_month: "Month-to-month",
};
const SERVICES: Record<string, string> = {
  valet_trash: "Doorstep valet trash",
  bulk_trash: "Bulk trash removal",
  pressure_washing: "Annual spot pressure washing",
  trash_outs: "Apartment trash-outs",
  lot_cleanup: "Nightly lot cleanup",
  full_pressure_washing: "Full-service pressure washing",
};

const usd = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

export type QuotePricing = { rateCentsPerUnit: number; units: number; term: QuoteTerm; senderName: string };

export const quoteFileName = (q: Pick<QuoteDetail, "refNo" | "community" | "company">) =>
  `CBES Quote ${q.refNo} - ${(q.community ?? q.company ?? "Community").replace(/[^\w\s-]/g, "").trim()}.pdf`;

/** The logo as a data URL, or null if it can't be loaded (the PDF then uses the name alone). */
async function logo(): Promise<string | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}logo-blue-on-white.png`);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function buildQuotePdf(q: QuoteDetail, p: QuotePricing, today = new Date()): Promise<Blob> {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const width = doc.internal.pageSize.getWidth();
  const image = await logo();

  doc.setFillColor(...NAVY).rect(0, 0, width, 92, "F");
  doc.setFont("helvetica", "bold").setFontSize(20).setTextColor(255).text("Service quote", MARGIN, 52);
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(200, 187, 165).text(`Quote #${q.refNo} · ${today.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`, MARGIN, 70);
  doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(255).text("CB ENVIRONMENT SOLUTIONS", width - MARGIN, 52, { align: "right" });
  doc.setFillColor(...GOLD).rect(0, 92, width, 4, "F");

  let y = 132;
  if (image) {
    doc.addImage(image, "PNG", width - MARGIN - 90, 112, 90, 77);
  }
  doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(...GOLD).text("PREPARED FOR", MARGIN, y);
  y += 16;
  const lines = [q.contact.name + (q.contact.title ? `, ${q.contact.title}` : ""), q.company, q.community, q.request.address, q.propertyCount != null ? `${q.propertyCount.toLocaleString("en-US")} ${q.propertyCount === 1 ? "property" : "properties"} needing service` : null].filter(Boolean) as string[];
  doc.setFont("helvetica", "normal").setFontSize(11).setTextColor(26, 28, 61);
  for (const line of lines) {
    doc.text(line, MARGIN, y);
    y += 15;
  }
  y += 18;

  const monthly = p.rateCentsPerUnit * p.units;
  const services = q.services.map((s) => SERVICES[s] ?? s).join(", ") || "Doorstep valet trash";
  autoTable(doc, {
    startY: Math.max(y, 200),
    head: [["Service", "Per unit / month", "Total units", "Monthly total"]],
    body: [[services, usd(p.rateCentsPerUnit), p.units.toLocaleString("en-US"), usd(monthly)]],
    margin: { left: MARGIN, right: MARGIN },
    styles: { font: "helvetica", fontSize: 11, cellPadding: 8, textColor: [26, 28, 61] },
    headStyles: { fillColor: NAVY, textColor: 255 },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right", fontStyle: "bold" } },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 26;

  const para = (label: string, text: string) => {
    doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(...NAVY).text(label, MARGIN, y);
    y += 15;
    doc.setFont("helvetica", "normal").setFontSize(10.5).setTextColor(...MUTED);
    const wrapped = doc.splitTextToSize(text, width - MARGIN * 2);
    doc.text(wrapped, MARGIN, y);
    y += wrapped.length * 14 + 14;
  };
  para("Term", TERMS[p.term]);
  para(
    "What's included",
    "Doorstep valet trash on your scheduled service nights. Residents can report an issue from the QR code on their container, and your Property Manager gets a weekly report every Monday with the nights serviced and every report.",
  );
  para("Next steps", "Reply to this email to accept or ask questions. We'll send the service agreement and certificate of insurance, then schedule your start date. Pricing holds for 30 days.");

  doc.setDrawColor(...GOLD).setLineWidth(1).line(MARGIN, y, width - MARGIN, y);
  y += 20;
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(...MUTED).text(`${p.senderName} · CB Environment Solutions · quotes@cbenvironments.com`, MARGIN, y);

  return doc.output("blob");
}
