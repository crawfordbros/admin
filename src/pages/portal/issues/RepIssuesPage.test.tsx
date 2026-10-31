import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PortalIssueDetail, PortalIssueList, PortalIssueRow } from "../../../lib/api";
import { mockFetch, renderRoute } from "../../../test/render";
import { RepContextProvider } from "../../../components/portal/RepContext";
import { RepIssuesPage } from "./RepIssuesPage";

const prop = (id: string, name: string) => ({ id, name, slug: id, city: null, organizationId: "org1", organizationName: "Peachtree Residential", photoVersion: null });
const repMe = {
  user: { id: "u1", email: "lauren@peachtree.com", name: "Lauren Kim", role: "representative" },
  organizations: [{ id: "org1", name: "Peachtree Residential", propertyCount: 2, propertyLimit: 100, logoVersion: null }],
  properties: [prop("p1", "The Oaks at Decatur"), prop("p2", "Brookhaven Terrace")],
};

const row = (patch: Partial<PortalIssueRow>): PortalIssueRow => ({
  id: "r1",
  refNo: 1042,
  issueLabel: "Missed pickup",
  createdAt: "2026-10-28T02:31:00Z",
  propertyId: "p1",
  propertyName: "The Oaks at Decatur",
  building: "3",
  unit: "305",
  statusLabel: "CBES replied",
  replyClock: { state: "replied", hours: 3.2 },
  ...patch,
});

const list = (patch: Partial<PortalIssueList> = {}): PortalIssueList => ({
  items: [row({}), row({ id: "r2", refNo: 1047, issueLabel: "Trash left in hallway", statusLabel: "New", building: null, unit: "2nd floor", replyClock: { state: "open", hoursLeft: 17.4, targetHours: 24 } })],
  total: 2,
  page: 1,
  pageSize: 25,
  tabCounts: { open: 2, resolved: 21, all: 23 },
  ...patch,
});

const detail = (patch: Partial<PortalIssueDetail> = {}): PortalIssueDetail => ({
  ...row({}),
  resident: { name: "Jasmine Carter", email: "j.carter@email.com", phone: "(470) 555-0147", okToCall: true },
  description: "My trash was out by 7 and it is still at my door.",
  photos: [],
  assignee: { id: "u-dana", name: "Dana Brooks", title: "CBES Steward" },
  firstReplyHours: 3.2,
  following: false,
  events: [
    { kind: "created", at: "2026-10-28T02:31:00Z", body: "My trash was out by 7 and it is still at my door.", photo: false },
    { kind: "reply", at: "2026-10-28T05:43:00Z", actor: { name: "Dana Brooks", title: "CBES Steward" }, body: "A valet is coming back by 2:30 AM." },
    { kind: "call", at: "2026-10-28T06:00:00Z", actor: { name: "Dana Brooks", title: "CBES Steward" } },
    { kind: "status", at: "2026-10-28T06:24:00Z", label: "Resolved" },
  ],
  ...patch,
});

type Extra = (url: string, method: string) => [number, unknown] | undefined;
const api = (data: PortalIssueList | [number, unknown] = list(), extra: Extra = () => undefined) =>
  mockFetch((url, method) => {
    const hit = extra(url, method);
    if (hit) return hit;
    if (url === "/api/portal/me") return [200, repMe];
    if (url.startsWith("/api/portal/issues?")) return Array.isArray(data) ? data : [200, data];
    if (url === "/api/portal/issues/r1") return [200, detail()];
    if (url === "/api/portal/issues/r2") return [200, detail({ id: "r2", refNo: 1047, issueLabel: "Trash left in hallway", statusLabel: "New", firstReplyHours: null })];
    return [404, { error: "Not found" }];
  });

const show = (url = "/portal/issues?org=org1") =>
  renderRoute(
    "/portal/issues/:reportId?",
    url,
    <RepContextProvider>
      <RepIssuesPage />
    </RepContextProvider>,
    undefined,
  );
const showIssue = (url: string) =>
  renderRoute(
    "/portal/issues/:reportId",
    url,
    <RepContextProvider>
      <RepIssuesPage />
    </RepContextProvider>,
    <Route path="*" element={null} />,
  );

beforeEach(() => vi.stubGlobal("__clerkRole", "representative"));
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("RepIssuesPage", () => {
  it("lists open issues with their reply clocks, and shows the first one", async () => {
    const calls = api();
    show();
    const listPane = await screen.findByRole("region", { name: "Issues" });
    expect(await within(listPane).findByText("Trash left in hallway")).toBeInTheDocument();
    expect(within(listPane).getByText("Reply due in 18h")).toBeInTheDocument();
    expect(within(listPane).getByText("Replied in 3h")).toBeInTheDocument();
    expect(within(listPane).getByText("#1047 · 2nd floor")).toBeInTheDocument();
    expect(within(listPane).getByRole("link", { name: /Missed pickup/ })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("tab", { name: /Resolved/ })).toHaveTextContent("21");
    expect(await screen.findByRole("heading", { level: 2, name: "Missed pickup" })).toBeInTheDocument();
    expect(Object.fromEntries(new URL(calls.find((c) => c.url.startsWith("/api/portal/issues?"))!.url, "http://x").searchParams)).toMatchObject({ org: "org1", tab: "open" });
  });

  it("shows the resident, who's on it at CBES, and the conversation", async () => {
    api();
    showIssue("/portal/issues/r1?org=org1");
    const detailPane = await screen.findByRole("region", { name: "Missed pickup" });
    expect(within(detailPane).getByText("First reply in 3h 12m")).toBeInTheDocument();
    expect(within(detailPane).getByText("j.carter@email.com")).toBeInTheDocument();
    expect(within(detailPane).getByText("OK to call")).toBeInTheDocument();
    expect(within(detailPane).getByText("Dana Brooks, Steward")).toBeInTheDocument();
    const thread = within(detailPane).getByRole("list", { name: "Conversation" });
    expect(within(thread).getByText("Jasmine Carter · Resident")).toBeInTheDocument();
    expect(within(thread).getByText("A valet is coming back by 2:30 AM.")).toBeInTheDocument();
    expect(within(thread).getByText("Called the resident.")).toBeInTheDocument();
    expect(within(thread).getByText(/Resolved by CBES/)).toBeInTheDocument();
    expect(document.title).toBe("#1042 Missed pickup | CBES Portal");
  });

  it("is view-only: no reply box, status control or assignment anywhere", async () => {
    api();
    showIssue("/portal/issues/r1?org=org1");
    await screen.findByRole("heading", { level: 2, name: "Missed pickup" });
    expect(screen.getByText("View only. CBES staff reply to the resident and close the issue once it's fixed.")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    // The only select is the Property filter; nothing sets a status or an assignee.
    expect(screen.getAllByRole("combobox").map((s) => s.getAttribute("aria-label") ?? s.closest("label")?.textContent)).toEqual([expect.stringMatching(/^Property/)]);
    expect(screen.queryByRole("button", { name: /assign|reply|resolve/i })).not.toBeInTheDocument();
  });

  it("follows and unfollows an issue", async () => {
    const calls = api(list(), (url, method) =>
      url === "/api/portal/issues/r1/follow" ? [200, { following: method === "POST" }] : undefined,
    );
    showIssue("/portal/issues/r1?org=org1");
    await userEvent.click(await screen.findByRole("button", { name: "Email me updates" }));
    expect(await screen.findByRole("button", { name: "Following" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("We'll email you when CBES replies or resolves it.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Following" }));
    await waitFor(() => expect(calls.filter((c) => c.url.endsWith("/follow")).map((c) => c.method)).toEqual(["POST", "DELETE"]));
  });

  it("opens another issue and keeps the tab in the URL", async () => {
    api();
    show();
    await userEvent.click(await screen.findByRole("link", { name: /Trash left in hallway/ }));
    expect(screen.getByTestId("location")).toHaveTextContent("/portal/issues/r2?org=org1");
    await userEvent.click(screen.getByRole("tab", { name: /Resolved/ }));
  });

  it("says when nothing is open, and explains a failure", async () => {
    api(list({ items: [], total: 0, tabCounts: { open: 0, resolved: 0, all: 0 } }));
    const { unmount } = show();
    expect(await screen.findByText("No open issues. CBES will show new ones here as residents report them.")).toBeInTheDocument();
    unmount();
    api([500, { error: "Issues are unavailable." }]);
    show();
    expect(await screen.findByRole("alert")).toHaveTextContent("Issues are unavailable.");
  });

  it("scopes to one property from the filter", async () => {
    const calls = api();
    show();
    await screen.findByText("Trash left in hallway");
    await userEvent.selectOptions(screen.getByLabelText("Property"), "p2");
    await waitFor(() => expect(new URL(calls.filter((c) => c.url.startsWith("/api/portal/issues?")).at(-1)!.url, "http://x").searchParams.get("property")).toBe("p2"));
  });
});
