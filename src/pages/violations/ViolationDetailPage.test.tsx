import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockFetch, renderRoute } from "../../test/render";
import { violationDetail } from "../../test/fixtures";
import { ViolationDetailPage } from "./ViolationDetailPage";
import { PortalViolationPage } from "./PortalViolations";

function handler(url: string, method: string, body: unknown): [number, unknown] {
  if (url === "/api/admin/violations/v1" && method === "GET") return [200, violationDetail()];
  if (url === "/api/admin/violations/v1" && method === "PATCH") return [200, { violation: violationDetail({ status: (body as { status: "sent" }).status ?? "new" }) }];
  if (url === "/api/admin/violations/v1/notes") return [201, { event: violationDetail().events[0] }];
  return [404, { error: "Not found" }];
}

const show = () => renderRoute("/admin/violations/:id", "/admin/violations/v1", <ViolationDetailPage />);

afterEach(() => vi.unstubAllGlobals());

describe("ViolationDetailPage", () => {
  it("shows what was logged, where it stands and the unit's history", async () => {
    mockFetch(handler);
    show();
    expect(await screen.findByRole("heading", { name: "Bag not tied · Unit 412", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("The Oaks at Decatur · Building 4 · Peachtree")).toBeInTheDocument();
    const progress = screen.getByRole("list", { name: "Progress" });
    expect(within(progress).getByText("In review").closest("li")).toHaveAttribute("aria-current", "step");
    expect(within(progress).getByText("Chris Patel")).toBeInTheDocument();
    expect(screen.getByText("Left in place, bag torn.")).toBeInTheDocument();
    expect(screen.getByText("3 in 30 days")).toBeInTheDocument();
    expect(screen.getByText(/At the Overwatch threshold/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "V-1987" })).toHaveAttribute("href", "/admin/violations/v0");
    expect(screen.getByText("Retake photo 2 from further back.")).toBeInTheDocument();
  });

  it("notifies the valet and Steward by default, and the property only on property notes", async () => {
    const calls = mockFetch(handler);
    show();
    await userEvent.type(await screen.findByLabelText("Add a note"), "Please retake photo 2.");
    const manager = screen.getByRole("checkbox", { name: /Chris Patel/ });
    expect(manager).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: /Marcus Hill/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Dana Brooks/ })).toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Also show property" }));
    await userEvent.click(manager);
    await userEvent.click(screen.getByRole("button", { name: "Add note and notify 3" }));
    expect(await screen.findByText("Note added. Notified Marcus Hill, Dana Brooks, Chris Patel.")).toBeInTheDocument();
    expect(calls.find((c) => c.url === "/api/admin/violations/v1/notes")?.body).toEqual({
      body: "Please retake photo 2.",
      visibility: "property",
      notifyUserIds: ["user_valet", "user_lead", "user_pm"],
    });
  });

  it("sends to the property, and dismissing asks for a reason", async () => {
    const calls = mockFetch(handler);
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Send to property" }));
    await waitFor(() => expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ status: "sent" }));
    expect(await screen.findByText("Marked sent to property.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send to property" })).not.toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("Status"), "dismissed");
    const dialog = screen.getByRole("dialog", { name: "Dismiss violation" });
    await userEvent.type(within(dialog).getByLabelText("Reason"), "Not this unit.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(calls.filter((c) => c.method === "PATCH").at(-1)?.body).toEqual({ status: "dismissed", reason: "Not this unit." }));
  });
});

describe("PortalViolationPage", () => {
  const asRole = (role: string) => ((globalThis as { __clerkRole?: string }).__clerkRole = role);
  const sent = violationDetail({ status: "sent", events: [], people: { ...violationDetail().people, admins: [] } });

  afterEach(() => delete (globalThis as { __clerkRole?: string }).__clerkRole);

  it("lets a property manager resolve a sent violation, saying how, and write to CBES", async () => {
    asRole("manager");
    const calls = mockFetch((url, method) => (method === "PATCH" ? [200, { violation: { ...sent, status: "resolved", resolution: "courtesy_notice" } }] : url.endsWith("/notes") ? [201, {}] : [200, sent]));
    renderRoute("/portal/violations/:violationId", "/portal/violations/v1", <PortalViolationPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Mark resolved" }));
    await userEvent.click(screen.getByRole("radio", { name: "Courtesy notice sent" }));
    await userEvent.click(screen.getByRole("button", { name: "Save status" }));
    await waitFor(() => expect(calls.find((c) => c.method === "PATCH")).toMatchObject({ url: "/api/portal/violations/v1", body: { status: "resolved", resolution: "courtesy_notice" } }));
    expect(screen.queryByRole("button", { name: "CBES team only" })).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Add a note for CBES"), "Spoke with the resident.");
    await userEvent.click(screen.getByRole("button", { name: "Post note" }));
    await waitFor(() => expect(calls.find((c) => c.url.endsWith("/notes"))?.body).toEqual({ body: "Spoke with the resident." }));
  });

  it("lets a valet reply to CBES only", async () => {
    asRole("valet");
    const calls = mockFetch((url) => (url.endsWith("/notes") ? [201, {}] : [200, violationDetail()]));
    renderRoute("/portal/violations/:violationId", "/portal/violations/v1", <PortalViolationPage />);
    expect(await screen.findByText("Retake photo 2 from further back.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark resolved" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /Chris Patel/ })).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Add a note"), "Retook it.");
    await userEvent.click(screen.getByRole("checkbox", { name: /Dana Brooks/ }));
    await userEvent.click(screen.getByRole("button", { name: "Add note and notify 1" }));
    await waitFor(() => expect(calls.find((c) => c.url.endsWith("/notes"))?.body).toEqual({ body: "Retook it.", visibility: "cbes", notifyUserIds: ["user_lead"] }));
  });
});
