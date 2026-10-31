import type { QuoteDetail, QuoteStage, QuoteTerm } from "../../lib/api";

// Same keys and words as the public quote form (cbes-api src/shared/schemas.ts SERVICE_LABELS).
export const SERVICE_LABELS: Record<string, string> = {
  valet_trash: "Valet trash",
  bulk_trash: "Bulk",
  pressure_washing: "Washing",
  trash_outs: "Trash-outs",
  lot_cleanup: "Lot cleanup",
  full_pressure_washing: "Full washing",
};

export const STAGES: { value: QuoteStage; label: string; sub: string; dot: string }[] = [
  { value: "new", label: "New", sub: "Reply within 24 hours", dot: "bg-danger" },
  { value: "conversation", label: "In conversation", sub: "Questions, site visit", dot: "bg-[#d99a1e]" },
  { value: "quote_sent", label: "Quote sent", sub: "Waiting on decision", dot: "bg-navy" },
  { value: "contract_sent", label: "Contract sent", sub: "Out for signature", dot: "bg-gold-text" },
  { value: "won", label: "Won", sub: "Signed this quarter", dot: "bg-success" },
  { value: "lost", label: "Lost", sub: "Didn't go ahead", dot: "bg-placeholder" },
];

export const stageLabel = (s: QuoteStage) => STAGES.find((x) => x.value === s)!.label;

export const TERM_LABELS: Record<QuoteTerm, string> = { "12_month": "12-month, auto-renew", "36_month": "36-month", month_to_month: "Month-to-month" };

export type TemplateKey = "quote" | "visit" | "contract" | "follow_up";

/** Email templates with {{contactFirstName}}, {{community}} and {{senderName}} filled in. */
export function template(key: TemplateKey, q: Pick<QuoteDetail, "contact" | "community" | "company">, senderName: string): { subject: string; body: string } {
  const first = q.contact.name.split(/\s+/)[0];
  const place = q.community ?? q.company ?? "your community";
  const sign = `\n\nThanks,\n${senderName}\nCB Environment Solutions`;
  switch (key) {
    case "quote":
      return { subject: `Your quote for ${place}`, body: `Hi ${first},\n\nAttached is our quote for ${place}. It covers doorstep valet trash on your service nights, with every pickup tracked by our valets and reported to you weekly.\n\nHappy to walk through it or adjust anything.${sign}` };
    case "visit":
      return { subject: `Walking ${place}`, body: `Hi ${first},\n\nThanks for reaching out. Could we walk the property this week to see the buildings and trash areas? Let me know a day and time that works.${sign}` };
    case "contract":
      return { subject: `Service agreement for ${place}`, body: `Hi ${first},\n\nAttached is the service agreement for ${place}, along with our certificate of insurance. Sign and send it back, and we'll schedule the start date.${sign}` };
    default:
      return { subject: `Following up on ${place}`, body: `Hi ${first},\n\nJust checking in on the quote for ${place}. Any questions I can answer?${sign}` };
  }
}

/** "$4,560.00" */
export const money = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
