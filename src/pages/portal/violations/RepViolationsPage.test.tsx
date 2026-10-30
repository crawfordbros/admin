import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PortalViolationList } from "../../../lib/api";
import { addDays, nyToday } from "../../../lib/format";
import { mockFetch, renderRoute } from "../../../test/render";
import { violationRow } from "../../../test/fixtures";
import { RepContextProvider } from "../../../components/portal/RepContext";
import { RepViolationsPage } from "./RepViolationsPage";

const prop = (id: string, name: string) => ({ id, name, slug: id, city: null, organizationId: "org1", organizationName: "Peachtree Residential", photoVersion: null });
const repMe = {
  user: { id: "u1", email: "lauren@peachtree.com", name: "Lauren Kim", role: "representative" },
  organizations: [{ id: "org1", name: "Peachtree Residential", propertyCount: 2, propertyLimit: 100, logoVersion: null }],
  properties: [prop("p1", "The Oaks at Decatur"), prop("p2", "Brookhaven Terrace")],
};
const managerMe = { user: { id: "u2", email: "chris@peachtree.com", name: "Chris Patel", role: "manager" }, organizations: [], properties: [{ ...prop("p1", "The Oaks at Decatur"), memberRole: "manager" }] };

const list = (patch: Partial<PortalViolationList> = {}): PortalViolationList => ({
  items: [
    violationRow({ id: "v1", refNo: 2041, status: "sent", sentAt: "2026-10-27T14:00:00Z", repeat: true, unitCount30d: 3 }),
    violationRow({ id: "v2", refNo: 2038, status: "sent", typeLabel: "Out after 8 PM", repeat: false, unitCount30d: 1, propertyName: "Brookhaven Terrace", unit: "214", building: "B" }),
  ],
  total: 2,
  page: 1,
  pageSize: 25,
  statusCounts: { toReview: 2, resolved: 53, all: 55 },
  types: [
    { key: "bag_not_tied", label: "Bag not tied" },
    { key: "after_8pm", label: "Out after 8 PM" },
  ],
  ...patch,
});

type Extra = (url: string, method: string, body: unknown) => [number, unknown] | undefined;
function api(me: unknown = repMe, data: PortalViolationList | [number, unknown] = list(), extra: Extra = () => undefined) {
  return mockFetch((url, method, body) => {
    const hit = extra(url, method, body);
    if (hit) return hit;
    if (url === "/api/portal/me") return [200, me];
    if (url.startsWith("/api/portal/violations?")) return Array.isArray(data) ? data : [200, data];
    if (url.startsWith("/api/portal/nav-counts")) return [200, { violationsToReview: 2, openIssues: 0, pendingInvitations: 0 }];
    return [404, { error: "Not found" }];
  });
}

const show = (url = "/portal/violations?org=org1") =>
  renderRoute(
    "/portal/violations",
    url,
    <RepContextProvider>
      <RepViolationsPage />
    </RepContextProvider>,
  );

const listCalls = (calls: { url: string }[]) => calls.filter((c) => c.url.startsWith("/api/portal/violations?")).map((c) => new URL(c.url, "http://x").searchParams);

beforeEach(() => vi.stubGlobal("__clerkRole", "representative"));
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("RepViolationsPage", () => {
  it("opens on To review for the organization, last 30 days", async () => {
    const calls = api();
    show();
    expect(await screen.findByRole("heading", { level: 1, name: "Violations" })).toBeInTheDocument();
    const table = await screen.findByRole("table", { name: "Violations" });
    expect(within(table).getByText("V-2041 · 2 photos")).toBeInTheDocument();
    expect(within(table).getByText("3 · repeat")).toBeInTheDocument();
    expect(within(table).getAllByText("To review")).toHaveLength(2);
    expect(within(table).getByText("Brookhaven Terrace")).toBeInTheDocument();
    expect(within(table).getByRole("link", { name: "Open V-2041" })).toHaveAttribute("href", "/portal/violations/v1");
    expect(screen.getByRole("tab", { name: /To review/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /Resolved/ })).toHaveTextContent("53");
    const q = listCalls(calls)[0];
    expect(Object.fromEntries(q)).toMatchObject({ org: "org1", status: "to_review", from: addDays(nyToday(), -29), page: "1" });
    expect(document.title).toBe("Violations | CBES Portal");
  });

  it("keeps the tab and filters in the URL", async () => {
    const calls = api();
    show();
    await screen.findByRole("table", { name: "Violations" });
    await userEvent.click(screen.getByRole("tab", { name: /Resolved/ }));
    expect(screen.getByTestId("location")).toHaveTextContent("status=resolved");
    await userEvent.selectOptions(screen.getByLabelText("Type"), "after_8pm");
    await userEvent.selectOptions(screen.getByLabelText("Dates"), "all");
    await userEvent.click(screen.getByRole("checkbox", { name: "Repeat units only" }));
    await userEvent.type(screen.getByLabelText("Search by unit, building or violation number"), "412");
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("q=412"));
    await userEvent.selectOptions(screen.getByLabelText("Property"), "p2");
    const last = listCalls(calls).at(-1)!;
    expect(Object.fromEntries(last)).toMatchObject({ property: "p2", status: "resolved", type: "after_8pm", repeat: "1", q: "412" });
    expect(last.has("org")).toBe(false);
    expect(last.has("from")).toBe(false);
  });

  it("says so when there's nothing to review, or nothing in range", async () => {
    api(repMe, list({ items: [], total: 0 }));
    const { unmount } = show();
    expect(await screen.findByText("No violations to review.")).toBeInTheDocument();
    unmount();
    api(repMe, list({ items: [], total: 0 }));
    show("/portal/violations?org=org1&status=all");
    expect(await screen.findByText("No violations in this range.")).toBeInTheDocument();
  });

  it("explains a failure and retries", async () => {
    let fail = true;
    api(repMe, list(), (url) => (url.startsWith("/api/portal/violations?") && fail ? [500, { error: "Violations are unavailable." }] : undefined));
    show();
    expect(await screen.findByRole("alert")).toHaveTextContent("Violations are unavailable.");
    fail = false;
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("table", { name: "Violations" })).toBeInTheDocument();
  });

  it("scopes a manager to their property and hides the property filter", async () => {
    vi.stubGlobal("__clerkRole", "manager");
    const calls = api(managerMe, list({ items: [violationRow({ status: "sent" })], total: 1 }));
    show("/portal/violations");
    const table = await screen.findByRole("table", { name: "Violations" });
    await within(table).findByText("V-2041 · 2 photos");
    expect(screen.queryByLabelText("Property")).not.toBeInTheDocument();
    expect(within(table).queryByRole("columnheader", { name: "Property" })).not.toBeInTheDocument();
    await waitFor(() => expect(listCalls(calls).at(-1)!.get("property")).toBe("p1"));
  });

  it("marks selected violations resolved, saying how", async () => {
    const calls = api(repMe, list(), (url, method) => (method === "POST" && url === "/api/portal/violations/bulk" ? [200, { changed: 1, skipped: [{ id: "v2", reason: "Already resolved" }] }] : undefined));
    show();
    const table = await screen.findByRole("table", { name: "Violations" });
    await userEvent.click(await within(table).findByRole("checkbox", { name: "Select V-2041" }));
    await userEvent.click(within(table).getByRole("checkbox", { name: "Select V-2038" }));
    const bar = screen.getByRole("region", { name: "Selected violations" });
    expect(bar).toHaveTextContent("2 selected");
    await userEvent.click(within(bar).getByRole("button", { name: "Mark resolved" }));
    const dialog = screen.getByRole("dialog", { name: "Mark 2 violations resolved" });
    await userEvent.click(within(dialog).getByRole("radio", { name: "Other (add a note)" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Mark resolved" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Tell CBES what you did.");
    await userEvent.click(within(dialog).getByRole("radio", { name: "Spoke with the resident" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Mark resolved" }));
    expect(await screen.findByText("1 violation marked resolved. 1 was already resolved or not yours to change.")).toBeInTheDocument();
    expect(calls.find((c) => c.url === "/api/portal/violations/bulk")?.body).toEqual({ ids: ["v1", "v2"], status: "resolved", resolution: "spoke_with_resident" });
    expect(screen.queryByRole("region", { name: "Selected violations" })).not.toBeInTheDocument();
  });

  it("exports the filtered list as CSV", async () => {
    const created = vi.fn(() => "blob:csv");
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: created, revokeObjectURL: vi.fn() }));
    const calls = api(repMe, list(), (url) => (url.startsWith("/api/portal/violations/export.csv") ? [200, "Ref\r\n"] : undefined));
    show("/portal/violations?org=org1&status=all&range=all");
    await screen.findByRole("table", { name: "Violations" });
    await userEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    await waitFor(() => expect(created).toHaveBeenCalled());
    const exported = calls.find((c) => c.url.includes("export.csv"))!;
    expect(new URL(exported.url, "http://x").searchParams.toString()).toBe("org=org1&status=all");
  });
});
