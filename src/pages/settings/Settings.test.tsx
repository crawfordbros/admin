import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdminSettings } from "../../lib/api";
import { mockFetch, renderRoute } from "../../test/render";
import { changes, holidayNote, toDraft, validate } from "./model";
import { SettingsPage } from "./SettingsPage";

// Holidays a year out, so the page (which lists only upcoming ones) always shows them.
const NEXT = new Date().getFullYear() + 1;
const settings = (): AdminSettings => ({
  overwatch: { count: 3, days: 30, countDismissed: false },
  calendar: { serviceNights: ["sun", "mon", "tue", "wed", "thu"], startTime: "20:00", makeupPolicy: "next_night" },
  weeklyReport: { day: "mon", time: "07:00", tz: "America/New_York" },
  email: { reportsFrom: "office@cbenvironments.com", quotesFrom: "quotes@cbenvironments.com", allowedSenders: ["office@cbenvironments.com", "quotes@cbenvironments.com"] },
  issueTypes: [
    { key: "missed_pickup", label: "Missed pickup", labelEs: "Recolección omitida", replyTargetHours: 24, onForm: true, used: true },
    { key: "trash_in_hallway", label: "Trash in hallway", labelEs: "Basura en el pasillo", replyTargetHours: 24, onForm: true, used: true },
    { key: "other", label: "Other", labelEs: "Otro", replyTargetHours: 24, onForm: true, used: false },
  ],
  violationTypes: [
    { key: "bag_not_tied", label: "Bag not tied", labelEs: "Bolsa sin amarrar", active: true, countsForOverwatch: true, thisMonth: 31, used: true },
    { key: "container_not_out", label: "Container not set out", labelEs: null, active: true, countsForOverwatch: false, thisMonth: 40, used: true },
  ],
  holidays: [
    { date: `${NEXT}-11-26`, name: "Thanksgiving Day" },
    { date: `${NEXT}-12-25`, name: "Christmas Day" },
  ],
});

describe("settings model", () => {
  it("counts changes per section, including new and reordered rows", () => {
    const base = toDraft(settings());
    const draft = toDraft(settings());
    draft.overwatch.count = 4;
    draft.issueTypes = [draft.issueTypes[1], draft.issueTypes[0], draft.issueTypes[2], { id: "new-1", key: "", label: "Gate code", labelEs: null, replyTargetHours: 12, onForm: true, used: false }];
    draft.holidays = draft.holidays.slice(1).concat({ date: `${NEXT + 1}-01-01`, name: "New Year's Day" });
    const c = changes(base, draft);
    expect(c).toMatchObject({ overwatch: 1, issues: 2, violations: 0, calendar: 2, reports: 0 });
    expect(c.total).toBe(5);
  });

  it("notes when a holiday is made up", () => {
    const cal = settings().calendar;
    expect(holidayNote("2026-11-26", cal)).toBe("Thu, 2026 · made up Fri");
    expect(holidayNote("2026-12-25", cal)).toBe("Fri, 2026 · not a service night");
    expect(holidayNote("2027-07-04", cal)).toBe("Sun, 2027 · made up Mon");
    expect(holidayNote("2027-05-31", { ...cal, makeupPolicy: "skip" })).toBe("Mon, 2027 · no make-up");
  });

  it("rejects blank or duplicate labels, no service nights and unknown senders", () => {
    const d = toDraft(settings());
    d.issueTypes[2].label = "missed pickup";
    d.violationTypes[0].label = " ";
    d.calendar.serviceNights = [];
    d.email.quotesFrom = "nick@example.com";
    d.violationTypes.forEach((t) => (t.active = false));
    expect(validate(d)).toEqual({
      violationTypes: "Keep at least one violation type active",
      "issue:other": "Another issue type already has this label",
      "violation:bag_not_tied": "Enter a label",
      "calendar.serviceNights": "Choose at least one service night",
      "email.quotesFrom": "Email can only be sent from office@cbenvironments.com or quotes@cbenvironments.com. Another address needs to be added to the email sending setup first.",
    });
  });
});

afterEach(() => vi.unstubAllGlobals());

function handler(url: string, method: string): [number, unknown] {
  if (url === "/api/admin/settings" && method === "GET") return [200, settings()];
  if (url.startsWith("/api/admin/settings/overwatch-preview")) return [200, url.includes("count=4") ? { units: 2, properties: 2 } : { units: 5, properties: 4 }];
  if (url === "/api/admin/settings" && method === "PATCH") return [200, settings()];
  if (url.startsWith("/api/admin/settings/") && method === "PUT") return [200, settings()];
  if (url === "/api/admin/settings/holidays" && method === "POST") return [201, { holidays: settings().holidays }];
  if (url.startsWith("/api/admin/settings/holidays") && method === "DELETE") return [204, null];
  return [404, { error: "Not found" }];
}

describe("SettingsPage", () => {
  it("previews the threshold live and saves only what changed", async () => {
    const calls = mockFetch(handler);
    renderRoute("/admin/settings", "/admin/settings", <SettingsPage />);

    expect(await screen.findByText(/across 4 properties are flagged today/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "More violations" }));
    expect(screen.getByText("1 unsaved change")).toBeInTheDocument();
    expect(await screen.findByText(/across 2 properties are flagged today/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("checkbox", { name: "Friday" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove Christmas Day" }));
    expect(screen.getByText("3 unsaved changes")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.getByText("Settings saved")).toBeInTheDocument());
    const writes = calls.filter((c) => c.method !== "GET");
    // One call: the holiday list rides with the calendar so the section is saved and logged once.
    expect(writes.map((c) => `${c.method} ${c.url}`)).toEqual(["PATCH /api/admin/settings"]);
    expect(writes[0].body).toEqual({
      overwatch: { count: 4, days: 30, countDismissed: false },
      calendar: { serviceNights: ["sun", "mon", "tue", "wed", "thu", "fri"], startTime: "20:00", makeupPolicy: "next_night" },
      holidays: [{ date: `${NEXT}-11-26`, name: "Thanksgiving Day" }],
    });
  });

  it("adds and reorders issue types, sending the full ordered list", async () => {
    const calls = mockFetch(handler);
    renderRoute("/admin/settings", "/admin/settings", <SettingsPage />);
    const section = (await screen.findByRole("heading", { name: "Resident issue types" })).closest("section")!;

    await userEvent.click(within(section).getByRole("button", { name: "Add issue type" }));
    const labels = within(section).getAllByRole("textbox", { name: "Label" });
    expect(labels[3]).toHaveFocus();
    await userEvent.type(labels[3], "Gate code not working");

    const handle = within(section).getByRole("button", { name: "Reorder Trash in hallway, position 2 of 4" });
    handle.focus();
    await userEvent.keyboard("{ArrowUp}");
    expect(within(section).getByRole("button", { name: "Reorder Trash in hallway, position 1 of 4" })).toHaveFocus();
    expect(screen.getByText("Trash in hallway moved to position 1 of 4")).toBeInTheDocument();

    await userEvent.click(within(section).getAllByRole("switch", { name: "Show on form" })[2]);
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
    expect(calls.find((c) => c.method === "PUT")).toMatchObject({
      url: "/api/admin/settings/issue-types",
      body: {
        items: [
          { key: "trash_in_hallway", label: "Trash in hallway", labelEs: "Basura en el pasillo", replyTargetHours: 24, onForm: true },
          { key: "missed_pickup", label: "Missed pickup", labelEs: "Recolección omitida", replyTargetHours: 24, onForm: true },
          { key: "other", label: "Other", labelEs: "Otro", replyTargetHours: 24, onForm: false },
          { label: "Gate code not working", labelEs: null, replyTargetHours: 24, onForm: true },
        ],
      },
    });
  });

  it("blocks saving until problems are fixed, and discards edits", async () => {
    const calls = mockFetch(handler);
    renderRoute("/admin/settings", "/admin/settings", <SettingsPage />);
    const section = (await screen.findByRole("heading", { name: "Violation types" })).closest("section")!;
    await userEvent.clear(within(section).getAllByRole("textbox", { name: "Violation label" })[0]);

    const quotes = screen.getByLabelText("Quotes sent from");
    await userEvent.clear(quotes);
    await userEvent.type(quotes, "nick@gmail.com");
    // The sender warning shows right away.
    expect(screen.getByText(/Email can only be sent from/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Fix the highlighted fields, then save again.");
    expect(within(section).getByText("Enter a label")).toBeInTheDocument();
    expect(calls.filter((c) => c.method !== "GET")).toEqual([]);

    await userEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(screen.getByLabelText("Quotes sent from")).toHaveValue("quotes@cbenvironments.com");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  it("puts the API's row errors on the right row", async () => {
    mockFetch((url, method) =>
      url === "/api/admin/settings/violation-types" && method === "PUT" ? [422, { error: "Check the highlighted fields.", fieldErrors: { "items.1.label": "That label is taken" } }] : handler(url, method),
    );
    renderRoute("/admin/settings", "/admin/settings", <SettingsPage />);
    const section = (await screen.findByRole("heading", { name: "Violation types" })).closest("section")!;
    await userEvent.type(within(section).getAllByRole("textbox", { name: "Violation label" })[1], "!");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await within(section).findByText("That label is taken")).toBeInTheDocument();
    expect(within(section).getAllByRole("textbox", { name: "Violation label" })[1]).toHaveAttribute("aria-invalid", "true");
  });

  it("shows field errors the API returns", async () => {
    mockFetch((url, method) =>
      url === "/api/admin/settings" && method === "PATCH" ? [422, { error: "Check the highlighted fields.", fieldErrors: { "email.reportsFrom": "That address can't send email yet" } }] : handler(url, method),
    );
    renderRoute("/admin/settings", "/admin/settings", <SettingsPage />);
    await userEvent.selectOptions(await screen.findByLabelText("Send day"), "tue");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("That address can't send email yet")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Check the highlighted fields.");
    expect(screen.getByText("1 unsaved change")).toBeInTheDocument();
  });
});
