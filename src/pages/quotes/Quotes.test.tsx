import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { QuoteCard, QuoteDetail } from "../../lib/api";
import { mockFetch, renderRoute } from "../../test/render";
import { QuotesPage } from "./QuotesPage";
import { QuoteDetailPage } from "./QuoteDetailPage";

vi.mock("../../lib/quote-pdf", () => ({ buildQuotePdf: vi.fn(async () => new Blob(["%PDF"], { type: "application/pdf" })), quoteFileName: () => "CBES Quote 501.pdf" }));

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const card = (o: Partial<QuoteCard>): QuoteCard => ({
  id: "q1", refNo: 501, kind: "quote", stage: "new", community: "Harbor Pointe Apartments", company: "Harbor Point Management", contactName: "Devon Walsh",
  units: 220, services: ["valet_trash", "pressure_washing"], createdAt: hoursAgo(26), firstResponseAt: null,
  lastActivity: { kind: "form", text: "Website form", at: hoursAgo(26) }, messagesCount: 1, owner: null, source: "web", ...o,
});
const cards = [card({}), card({ id: "q2", refNo: 502, community: "Smyrna Heights", stage: "conversation", createdAt: hoursAgo(72), owner: { id: "u1", name: "Nigel Crawford" }, lastActivity: { kind: "email_in", text: "4 emails", at: hoursAgo(2) } })];
const kpis = { newCount: 1, newOver24h: 1, avgFirstResponseHours: 9.4, quotesOut: 2, quotesOutUnits: 640, contractsOut: 0, oldestContractSentAt: null, wonThisQuarter: 3, winRatePct: 57 };
const detail = (o: Partial<QuoteDetail> = {}): QuoteDetail => ({
  ...card({}),
  contact: { name: "Devon Walsh", title: "Regional manager", email: "devon@harborpoint.com", phone: "(404) 555-0148" },
  request: { address: "6100 Roswell Rd, Sandy Springs", propertyType: "mid_rise", desiredStart: "2027-01-01", currentProvider: "Another valet provider", message: "Our current provider misses pickups." },
  rateCentsPerUnit: null, term: null, lostReason: null, organizationId: null,
  notes: [{ id: "n1", author: { id: "u1", name: "Nigel Crawford" }, body: "Bulk needs a hauler permit.", createdAt: hoursAgo(5) }],
  messages: [{ id: "m1", direction: "in", from: "Devon Walsh (website form)", to: "quotes@cbenvironments.com", cc: [], subject: null, body: "Looking for valet trash.", createdAt: hoursAgo(26), sentBy: null, attachments: [] }],
  documents: [{ id: "d1", kind: "contract", fileName: "Harbor Pointe agreement.docx", contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", bytes: 20000, status: "ready", uploadedBy: { id: "u1", name: "Nigel Crawford" }, createdAt: hoursAgo(3) }],
  ...o,
});

function handler(url: string, method: string): [number, unknown] {
  if (url.startsWith("/api/admin/quotes") && method === "GET" && !url.includes("/q1")) return [200, { items: cards, kpis }];
  if (url === "/api/admin/quotes/q1" && method === "GET") return [200, detail()];
  if (url === "/api/admin/quotes/q1" && method === "PATCH") return [200, { quote: detail({ rateCentsPerUnit: 1450, units: 220, term: "12_month" }) }];
  if (url === "/api/admin/quotes/q2" && method === "PATCH") return [200, { quote: detail({ id: "q2" }) }];
  if (url.startsWith("/api/admin/quotes/q1/") && method === "POST") return [201, { quote: detail(), document: {} }];
  if (url === "/api/admin/quotes" && method === "POST") return [201, { quote: { id: "q9", refNo: 509 } }];
  if (url === "/api/admin/contract-templates") return [200, { items: [{ key: "12_month", label: "Vendor Agreement – 12-Month Auto-Renew", fileName: null, uploadedAt: null }, { key: "coi", label: "Certificate of insurance", fileName: null, uploadedAt: null }] }];
  if (url === "/api/admin/assignees") return [200, { items: [{ id: "u1", name: "Nigel Crawford", role: "admin" }] }];
  if (url === "/api/organizations") return [200, { organizations: [] }];
  return [404, { error: "Not found" }];
}

afterEach(() => vi.unstubAllGlobals());

describe("QuotesPage", () => {
  it("shows the pipeline with the most overdue request highlighted", async () => {
    mockFetch(handler);
    renderRoute("/admin/quotes", "/admin/quotes", <QuotesPage />);
    const newCol = await screen.findByRole("region", { name: "New" }).catch(() => screen.getByRole("heading", { name: "New" }).closest("section")!);
    const harbor = within(newCol).getByRole("link", { name: "Harbor Pointe Apartments" }).closest("div")!;
    expect(harbor).toHaveTextContent("220 units");
    expect(harbor).toHaveTextContent("26h waiting, over 24 hours");
    expect(harbor.className).toContain("border-navy");
    expect(screen.getByText("1 waiting over 24h")).toBeInTheDocument();
    expect(screen.getByText("57% win rate")).toBeInTheDocument();
  });

  it("moves a quote with the keyboard menu, asking why for Lost", async () => {
    const calls = mockFetch(handler);
    renderRoute("/admin/quotes", "/admin/quotes", <QuotesPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Move Smyrna Heights to another stage" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Move to Quote sent" }));
    await waitFor(() => expect(calls.find((c) => c.method === "PATCH")).toMatchObject({ url: "/api/admin/quotes/q2", body: { stage: "quote_sent" } }));

    await userEvent.click(screen.getByRole("button", { name: "Move Smyrna Heights to another stage" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Move to Lost" }));
    const dialog = screen.getByRole("dialog", { name: "Mark as lost" });
    await userEvent.type(within(dialog).getByLabelText("Why didn't it go ahead?"), "Chose another provider");
    await userEvent.click(within(dialog).getByRole("button", { name: "Mark lost" }));
    await waitFor(() => expect(calls.filter((c) => c.method === "PATCH").at(-1)?.body).toEqual({ stage: "lost", lostReason: "Chose another provider" }));

    await userEvent.click(screen.getByRole("button", { name: "Move Smyrna Heights to another stage" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Move to Won" }));
    expect(screen.getByRole("dialog", { name: "Won: set up the customer" })).toHaveTextContent("This creates Smyrna Heights (220 units) as a property");
  });

  it("picks the existing organization when the company is already a customer", async () => {
    const calls = mockFetch((url, method) =>
      url === "/api/admin/quotes/q2/convert"
        ? (calls.filter((c) => c.url.endsWith("/convert")).length === 1 ? [409, { error: "exists", code: "organization_exists", organizationId: "org1" }] : [200, { organizationId: "org1", propertyId: "p9" }])
        : url === "/api/organizations" ? [200, { organizations: [{ id: "org1", name: "Summit Ridge Communities" }] }] : handler(url, method),
    );
    renderRoute("/admin/quotes", "/admin/quotes", <QuotesPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Move Smyrna Heights to another stage" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Move to Won" }));
    const dialog = screen.getByRole("dialog", { name: "Won: set up the customer" });
    await within(dialog).findByRole("option", { name: "Summit Ridge Communities" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Create organization and property" }));
    expect(await within(dialog).findByText(/is already an organization, so it's chosen above/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Organization")).toHaveValue("org1");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add property to organization" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/admin/organizations/org1/properties/p9"));
    expect(calls.filter((c) => c.url.endsWith("/convert")).at(-1)?.body).toEqual({ organizationId: "org1" });
  });

  it("lists quotes and adds one by hand", async () => {
    const calls = mockFetch(handler);
    renderRoute("/admin/quotes", "/admin/quotes?view=list", <QuotesPage />);
    expect(await screen.findByRole("table", { name: "Quotes" })).toHaveTextContent("Harbor Point Management");
    await userEvent.click(screen.getByRole("button", { name: "New quote" }));
    const dialog = screen.getByRole("dialog", { name: "New quote" });
    await userEvent.type(within(dialog).getByLabelText("Contact name"), "Ana Ruiz");
    await userEvent.type(within(dialog).getByLabelText("Email"), "ana@example.com");
    await userEvent.type(within(dialog).getByLabelText("Community"), "Lenox Park");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add quote" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/admin/quotes/q9"));
    expect(calls.find((c) => c.url === "/api/admin/quotes" && c.method === "POST")?.body).toMatchObject({ contactName: "Ana Ruiz", contactEmail: "ana@example.com", communityName: "Lenox Park", services: ["valet_trash"] });
  });
});

describe("QuoteDetailPage", () => {
  const show = () => renderRoute("/admin/quotes/:id", "/admin/quotes/q1", <QuoteDetailPage />);

  it("shows the request, notes and thread, and replies from a template", async () => {
    const calls = mockFetch(handler);
    show();
    expect(await screen.findByRole("heading", { name: "Harbor Pointe Apartments", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("Our current provider misses pickups.")).toBeInTheDocument();
    expect(screen.getByText(/Bulk needs a hauler permit/)).toBeInTheDocument();
    expect(screen.getByText("Looking for valet trash.")).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Template"), "visit");
    expect((screen.getByLabelText("Email to Devon Walsh") as HTMLTextAreaElement).value).toMatch(/^Hi Devon,/);
    await userEvent.click(screen.getByRole("button", { name: "Schedule site visit" }));
    await waitFor(() => expect(calls.find((c) => c.url.endsWith("/messages"))?.body).toMatchObject({ subject: "Walking Harbor Pointe Apartments", documentIds: [], cc: [] }));
  });

  it("sends the contract with its file attached", async () => {
    const calls = mockFetch(handler);
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Prepare contract email" }));
    expect(screen.getByRole("checkbox", { name: "Harbor Pointe agreement.docx" })).toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Send contract" }));
    await waitFor(() => expect(calls.find((c) => c.url.endsWith("/send-contract"))?.body).toMatchObject({ subject: "Service agreement for Harbor Pointe Apartments", documentIds: ["d1"] }));
  });

  it("prices the quote and stores the generated PDF", async () => {
    const calls = mockFetch(handler);
    show();
    await userEvent.type(await screen.findByLabelText("Per unit / month"), "14.50");
    expect(screen.getByText("$3,190.00")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Generate quote PDF" }));
    expect(await screen.findByText("Quote PDF added. Attach it to an email to send it.")).toBeInTheDocument();
    expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ rateCentsPerUnit: 1450, unitCount: 220, term: "12_month" });
    expect(calls.some((c) => c.url.endsWith("/documents") && c.method === "POST")).toBe(true);
  });

  it("asks for a reason before marking the quote lost", async () => {
    mockFetch(handler);
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Lost" }));
    expect(screen.getByRole("dialog", { name: "Mark as lost" })).toBeInTheDocument();
  });
});
