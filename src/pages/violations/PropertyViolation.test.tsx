import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ViolationDetail } from "../../lib/api";
import { mockFetch, renderRoute } from "../../test/render";
import { violationDetail } from "../../test/fixtures";
import { PortalViolationPage } from "./PortalViolations";

const save = vi.fn();
const build = vi.fn<(notices: unknown) => { save: typeof save }>(() => ({ save }));
vi.mock("../../lib/courtesy-pdf", () => ({ buildCourtesyNotices: (notices: unknown) => build(notices) }));

const sent = (patch: Partial<ViolationDetail> = {}) =>
  violationDetail({
    status: "sent",
    repeat: true,
    unitCount30d: 3,
    loggedAt: "2026-10-27T01:14:00Z",
    sentAt: "2026-10-27T14:02:00Z",
    sentBy: { id: "user_admin", name: "Nigel Crawford", role: "admin" },
    events: [
      { id: "e1", kind: "status", actor: { id: "user_admin", name: "Nigel Crawford", role: "admin" }, body: "Third untied bag this month.", visibility: "property", fromStatus: "in_review", toStatus: "sent", mentions: [], createdAt: "2026-10-27T14:02:00Z" },
    ],
    unitHistory: [{ id: "v1", refNo: 2041, typeLabel: "Bag not tied", loggedAt: "2026-10-27T01:14:00Z", status: "sent" }],
    ...patch,
  });

const show = (url = "/portal/violations/v1") => renderRoute("/portal/violations/:violationId", url, <PortalViolationPage />);

afterEach(() => {
  vi.unstubAllGlobals();
  build.mockClear();
  save.mockClear();
});

describe("the property's violation page", () => {
  it("shows what happened, who sent it and where it stands", async () => {
    vi.stubGlobal("__clerkRole", "manager");
    mockFetch(() => [200, sent()]);
    show();
    expect(await screen.findByRole("heading", { level: 1, name: "Bag not tied" })).toBeInTheDocument();
    expect(screen.getByText("3rd for this unit in 30 days")).toBeInTheDocument();
    expect(screen.getByText(/Building 4 · Unit 412 · Logged Mon, Oct 26 at 9:14 PM by Marcus Hill/)).toBeInTheDocument();
    const details = screen.getByRole("region", { name: "Details" });
    expect(within(details).getByText("Monday, Oct 26")).toBeInTheDocument();
    expect(within(details).getByText("Marcus Hill, CBES valet")).toBeInTheDocument();
    expect(within(details).getByText("Nigel Crawford, CBES")).toBeInTheDocument();
    expect(within(details).getByText("Left in place, bag torn.")).toBeInTheDocument();
    const timeline = screen.getByRole("list", { name: "Where this violation is" });
    expect(within(timeline).getByText(/waiting on you/)).toBeInTheDocument();
    const notes = screen.getByRole("region", { name: "Notes with CBES" });
    expect(within(notes).getByText("Third untied bag this month.")).toBeInTheDocument();
    expect(within(notes).getByText("Your Steward Dana Brooks and CBES admins get an email.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "All violations" })).toHaveAttribute("href", "/portal/violations?property=p1");
  });

  it("needs a note when it was handled some other way", async () => {
    vi.stubGlobal("__clerkRole", "representative");
    const calls = mockFetch(() => [200, sent()]);
    show();
    const card = await screen.findByRole("region", { name: "Update status" });
    await userEvent.selectOptions(within(card).getByLabelText("Status"), "resolved");
    await userEvent.click(within(card).getByRole("radio", { name: "Other (add a note)" }));
    await userEvent.click(within(card).getByRole("button", { name: "Save status" }));
    expect(within(card).getByRole("alert")).toHaveTextContent("Tell CBES what you did.");
    expect(calls.some((c) => c.method === "PATCH")).toBe(false);
    await userEvent.type(within(card).getByLabelText("Note for CBES"), "Moved their bin.");
    await userEvent.click(within(card).getByRole("button", { name: "Save status" }));
    await waitFor(() => expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ status: "resolved", resolution: "other", note: "Moved their bin." }));
  });

  it("reopens a resolved violation", async () => {
    vi.stubGlobal("__clerkRole", "manager");
    const resolved = sent({ status: "resolved", resolution: "courtesy_notice", resolvedAt: "2026-10-28T15:00:00Z", resolvedBy: { id: "user_pm", name: "Chris Patel", role: "manager" } });
    const calls = mockFetch((_url, method) => (method === "PATCH" ? [200, { violation: sent() }] : [200, resolved]));
    show();
    expect(await screen.findByText(/Chris Patel · Courtesy notice sent/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark resolved" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reopen" }));
    expect(await screen.findByText("Reopened.")).toBeInTheDocument();
    expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ status: "sent" });
  });

  it("downloads a courtesy notice built from the violation", async () => {
    vi.stubGlobal("__clerkRole", "manager");
    mockFetch(() => [200, sent()]);
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Courtesy notice (PDF)" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith("courtesy-notice-V-2041.pdf"));
    expect(build).toHaveBeenCalledWith([expect.objectContaining({ v: expect.objectContaining({ id: "v1", refNo: 2041 }), photo: null, logo: null })]);
  });

  it("changes nothing in the admin's manager preview", async () => {
    vi.stubGlobal("__clerkRole", "super_admin");
    mockFetch(() => [200, sent()]);
    show("/portal/violations/v1?as=manager");
    expect(await screen.findByRole("heading", { level: 1, name: "Bag not tied" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Update status" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark resolved" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Add a note for CBES")).not.toBeInTheDocument();
  });
});
