import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockFetch, renderRoute } from "../../test/render";
import { violationRow } from "../../test/fixtures";
import { ViolationsPage } from "./ViolationsPage";

const stageCounts = { new: 6, in_review: 3, sent: 18, resolved: 81, dismissed: 4 };
const list = (items = [violationRow(), violationRow({ id: "v2", refNo: 2040, typeLabel: "Trash outside container", unit: "118", unitCount30d: 1 })]) => ({ items, total: 112, page: 1, pageSize: 25, stageCounts });

function handler(url: string, method: string): [number, unknown] {
  if (url.startsWith("/api/admin/violations?")) return [200, list()];
  if (url === "/api/admin/violations/bulk") return [200, { updated: 1 }];
  if (url === "/api/admin/violations/send" && method === "POST") return [200, { sent: 3, properties: 2 }];
  if (url === "/api/admin/violation-types") return [200, { items: [{ key: "bag_not_tied", label: "Bag not tied", countsForOverwatch: true, active: true }] }];
  if (url === "/api/organizations") return [200, { organizations: [] }];
  if (url === "/api/admin/properties") return [200, { properties: [] }];
  if (url === "/api/admin/stewards") return [200, { items: [] }];
  return [404, { error: "Not found" }];
}

const show = (url = "/admin/violations") => renderRoute("/admin/violations", url, <ViolationsPage />);
const listCalls = (calls: { url: string }[]) => calls.filter((c) => c.url.startsWith("/api/admin/violations?")).map((c) => new URL(c.url, "http://x").searchParams);

afterEach(() => vi.unstubAllGlobals());

describe("ViolationsPage", () => {
  it("opens on New, shows each stage's count and switches stage from the tiles", async () => {
    const calls = mockFetch(handler);
    show();
    const row = (await screen.findByText("Bag not tied")).closest("tr")!;
    expect(row).toHaveTextContent("V-2041");
    expect(row).toHaveTextContent("Peachtree · Bldg 4 · 412");
    expect(row).toHaveTextContent("3 in 30 days");
    expect(listCalls(calls)[0].get("stage")).toBe("new");
    const tiles = screen.getByRole("group", { name: "Stage" });
    expect(within(tiles).getByRole("button", { name: /New\s*6/ })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(within(tiles).getByRole("button", { name: /In review/ }));
    expect(screen.getByTestId("location")).toHaveTextContent("stage=in_review");
    await waitFor(() => expect(listCalls(calls).at(-1)!.get("stage")).toBe("in_review"));
  });

  it("filters by type and keeps the filter in the address", async () => {
    const calls = mockFetch(handler);
    show("/admin/violations?page=3");
    await userEvent.click(await screen.findByRole("button", { name: /Type: All/ }));
    await userEvent.click(await screen.findByRole("checkbox", { name: "Bag not tied" }));
    expect(screen.getByTestId("location")).toHaveTextContent("type=bag_not_tied");
    // A new filter starts back at page 1.
    expect(screen.getByTestId("location")).not.toHaveTextContent("page=3");
    await waitFor(() => expect(listCalls(calls).at(-1)!.get("type")).toBe("bag_not_tied"));
  });

  it("moves selected violations in bulk and asks why before dismissing", async () => {
    const calls = mockFetch(handler);
    show();
    const row = (await screen.findByText("Bag not tied")).closest("tr")!;
    await userEvent.click(within(row).getByRole("checkbox", { name: "Select row" }));
    await userEvent.click(within(screen.getByRole("region", { name: "Selected violations" })).getByRole("button", { name: "Mark in review" }));
    expect(await screen.findByText("1 violation marked in review.")).toBeInTheDocument();
    expect(calls.find((c) => c.url === "/api/admin/violations/bulk")?.body).toEqual({ ids: ["v1"], status: "in_review" });

    await userEvent.click(within((await screen.findByText("Bag not tied")).closest("tr")!).getByRole("checkbox", { name: "Select row" }));
    await userEvent.click(within(screen.getByRole("region", { name: "Selected violations" })).getByRole("button", { name: "Dismiss" }));
    const dialog = screen.getByRole("dialog", { name: "Dismiss violation" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Dismiss" }));
    expect(within(dialog).getByText(/Say why/)).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText("Reason"), "Bag was tied.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(calls.filter((c) => c.url === "/api/admin/violations/bulk").at(-1)?.body).toEqual({ ids: ["v1"], status: "dismissed", reason: "Bag was tied." }));
  });

  it("sends everything in review to the properties", async () => {
    const calls = mockFetch(handler);
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Send reviewed to properties (3)" }));
    expect(await screen.findByText("Sent 3 violations to 2 properties.")).toBeInTheDocument();
    expect(calls.some((c) => c.url === "/api/admin/violations/send" && c.method === "POST")).toBe(true);
  });

  it("shows a photo grid", async () => {
    mockFetch(handler);
    show("/admin/violations?view=grid");
    const card = await screen.findByRole("link", { name: /Trash outside container/ });
    expect(card).toHaveTextContent("The Oaks at Decatur");
    expect(card).toHaveTextContent("Street address missing");
    expect(card).toHaveTextContent("Unit 118");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
