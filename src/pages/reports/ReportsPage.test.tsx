import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { nyToday, addDays } from "../../lib/format";
import { mockFetch, renderRoute } from "../../test/render";
import { reportDetail, reportRow, reportsSummary } from "../../test/fixtures";
import { ReportsPage } from "./ReportsPage";
import { ReportDrawer } from "./ReportDrawer";

const tabCounts = { open: 7, new: 2, in_progress: 5, resolved: 54, closed: 2 };
const list = { items: [reportRow(), reportRow({ id: "r2", refNo: 1040, issueKey: "spill_mess", issueLabel: "Spill or mess", replyClock: { state: "replied", hours: 2 }, status: "in_progress", assignee: { id: "u_ad", name: "Nigel Crawford" } })], total: 63, page: 1, pageSize: 25, tabCounts };

function handler(url: string, method: string, body: unknown): [number, unknown] {
  if (url.startsWith("/api/admin/reports?")) return [200, list];
  if (url.startsWith("/api/admin/reports/summary")) return [200, reportsSummary()];
  if (url === "/api/admin/reports/bulk") return [200, { updated: (body as { ids: string[] }).ids.length }];
  if (url === "/api/admin/reports" && method === "POST") return [201, { report: { id: "r9", refNo: 1050 } }];
  if (url === "/api/admin/reports/r1" && method === "GET") return [200, reportDetail()];
  if (url === "/api/admin/reports/r1/replies") return [201, { report: reportDetail({ replyClock: { state: "replied", hours: 21 } }) }];
  if (url === "/api/admin/reports/r1/calls") return [201, { report: reportDetail() }];
  if (url === "/api/admin/reports/r1" && method === "PATCH") return [200, { report: reportDetail({ assignee: { id: "u_ad", name: "Nigel Crawford" }, status: "assigned" }) }];
  if (url === "/api/admin/issue-types") return [200, { items: [{ key: "missed_pickup", label: "Missed pickup" }, { key: "spill_mess", label: "Spill or mess" }] }];
  if (url === "/api/admin/assignees") return [200, { items: [{ id: "u_ad", name: "Nigel Crawford" }] }];
  if (url === "/api/admin/properties") return [200, { properties: [{ id: "p1", name: "The Oaks at Decatur", city: "Decatur", status: "active", organizationId: "org1" }] }];
  if (url === "/api/organizations") return [200, { organizations: [] }];
  if (url.startsWith("/api/saved-views") && method === "GET") return [200, { items: [{ id: "sv1", name: "Over 20h, no reply", query: "sort=clock", createdAt: "" }] }];
  if (url === "/api/saved-views" && method === "POST") return [201, { view: {} }];
  return [404, { error: "Not found" }];
}

const show = (url = "/admin/reports") => renderRoute("/admin/reports", url, <ReportsPage />, <Route path=":id" element={<ReportDrawer />} />);
const params = (calls: { url: string }[], prefix: string) => calls.filter((c) => c.url.startsWith(prefix)).map((c) => new URL(c.url, "http://x").searchParams);

afterEach(() => vi.unstubAllGlobals());

describe("ReportsPage", () => {
  it("opens on open reports from the last 30 days, with the same filters on the charts", async () => {
    const calls = mockFetch(handler);
    show();
    const row = (await screen.findByText("Missed pickup", { selector: "a" })).closest("tr")!;
    expect(row).toHaveTextContent("#1042");
    expect(row).toHaveTextContent("3h left");
    expect(row).toHaveTextContent("Unassigned");
    expect(screen.getByRole("tab", { name: "Open 7" })).toHaveAttribute("aria-selected", "true");
    const today = nyToday();
    const listed = params(calls, "/api/admin/reports?")[0];
    expect([listed.get("tab"), listed.get("from"), listed.get("to")]).toEqual(["open", addDays(today, -29), today]);
    const summary = params(calls, "/api/admin/reports/summary")[0];
    expect([summary.get("from"), summary.has("tab")]).toEqual([addDays(today, -29), false]);
    expect(screen.getByText("3 nearing 24 hours")).toBeInTheDocument();
    expect(screen.getByText("Missed pickup · 30% of all reports")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "94 percent replied within 24 hours" })).toBeInTheDocument();
  });

  it("filters from a chart and lets the dates go back to any time", async () => {
    const calls = mockFetch(handler);
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Trash in hallway" }));
    expect(screen.getByTestId("location")).toHaveTextContent("type=trash_in_hallway");
    await userEvent.click(screen.getByRole("button", { name: "Remove Dates filter Last 30 days" }));
    expect(screen.getByTestId("location")).toHaveTextContent("dates=all");
    await waitFor(() => expect(params(calls, "/api/admin/reports?").at(-1)!.has("from")).toBe(false));
    expect(params(calls, "/api/admin/reports?").at(-1)!.get("type")).toBe("trash_in_hallway");
  });

  it("assigns selected reports in bulk", async () => {
    const calls = mockFetch(handler);
    show();
    const row = (await screen.findByText("Missed pickup", { selector: "a" })).closest("tr")!;
    await userEvent.click(within(row).getByRole("checkbox", { name: "Select row" }));
    await userEvent.click(within(screen.getByRole("region", { name: "Selected reports" })).getByRole("button", { name: "Assign" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Nigel Crawford" }));
    expect(await screen.findByText("1 report updated.")).toBeInTheDocument();
    expect(calls.find((c) => c.url === "/api/admin/reports/bulk")?.body).toEqual({ ids: ["r1"], assigneeUserId: "u_ad" });
  });

  it("drops the selection when the list changes, so bulk actions only reach reports on screen", async () => {
    mockFetch(handler);
    show();
    const row = (await screen.findByText("Missed pickup", { selector: "a" })).closest("tr")!;
    await userEvent.click(within(row).getByRole("checkbox", { name: "Select row" }));
    expect(screen.getByRole("region", { name: "Selected reports" })).toHaveTextContent("1 selected");
    await userEvent.click(screen.getByRole("button", { name: "Trash in hallway" }));
    expect(screen.queryByRole("region", { name: "Selected reports" })).not.toBeInTheDocument();
  });

  it("saves the current view", async () => {
    const calls = mockFetch(handler);
    show("/admin/reports?sort=clock");
    expect(await screen.findByRole("link", { name: "Over 20h, no reply" })).toHaveAttribute("href", "/admin/reports?sort=clock");
    await userEvent.click(screen.getByRole("button", { name: "Saved views" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Save current filters" }));
    await userEvent.type(screen.getByLabelText("Name"), "Most urgent");
    await userEvent.click(screen.getByRole("button", { name: "Save view" }));
    await waitFor(() => expect(calls.find((c) => c.url === "/api/saved-views" && c.method === "POST")?.body).toEqual({ page: "reports", name: "Most urgent", query: "sort=clock" }));
  });

  it("logs a phone report and opens it", async () => {
    const calls = mockFetch(handler);
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Log a phone report" }));
    const dialog = screen.getByRole("dialog", { name: "Log a phone report" });
    await userEvent.selectOptions(within(dialog).getByLabelText("Community"), "p1");
    await userEvent.selectOptions(within(dialog).getByLabelText("What happened"), "missed_pickup");
    await userEvent.type(within(dialog).getByLabelText("Resident's name"), "Ana Ruiz");
    await userEvent.type(within(dialog).getByLabelText("Phone number"), "404-555-0101");
    await userEvent.click(within(dialog).getByRole("button", { name: "Log report" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/admin/reports/r9"));
    expect(calls.find((c) => c.url === "/api/admin/reports" && c.method === "POST")?.body).toMatchObject({ propertyId: "p1", issueType: "missed_pickup", reporterName: "Ana Ruiz", reporterContact: "404-555-0101", contactMethod: "phone" });
  });
});

describe("ReportDrawer", () => {
  it("replies to the resident by email and assigns the report", async () => {
    const calls = mockFetch(handler);
    show("/admin/reports/r1?tab=new");
    const drawer = await screen.findByRole("dialog", { name: "Missed pickup" });
    expect(await within(drawer).findByText("jordan@example.com")).toBeInTheDocument();
    await userEvent.type(within(drawer).getByLabelText("Reply to Jordan Lee"), "We'll be back tonight.");
    await userEvent.click(within(drawer).getByRole("button", { name: "Send reply" }));
    expect(await screen.findByText("Reply sent to jordan@example.com.")).toBeInTheDocument();
    expect(calls.find((c) => c.url.endsWith("/replies"))?.body).toEqual({ body: "We'll be back tonight." });
    await userEvent.selectOptions(within(drawer).getByLabelText("Assigned to"), "u_ad");
    await waitFor(() => expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ assigneeUserId: "u_ad" }));
    await userEvent.click(within(drawer).getByRole("button", { name: "Close" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/admin/reports?tab=new");
  });

  it("logs a call for residents who asked for one", async () => {
    const calls = mockFetch((url, method, body) => (url === "/api/admin/reports/r1" && method === "GET" ? [200, reportDetail({ contactMethod: "phone", reporterContact: "404-555-0101" })] : handler(url, method, body)));
    show("/admin/reports/r1");
    const drawer = await screen.findByRole("dialog", { name: "Missed pickup" });
    await userEvent.type(await within(drawer).findByLabelText("What you told Jordan Lee on the phone"), "Left a voicemail.");
    await userEvent.click(within(drawer).getByRole("button", { name: "Log call" }));
    await waitFor(() => expect(calls.find((c) => c.url.endsWith("/calls"))?.body).toEqual({ body: "Left a voicemail." }));
  });
});
