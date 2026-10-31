import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockFetch } from "../../test/render";
import { ToastProvider } from "../Toast";
import { AdminShell } from "./AdminShell";
import { useAdminPage } from "./adminPage";

function Page() {
  useAdminPage("Demo Management", [{ label: "Organizations", to: "/admin/organizations" }, { label: "Demo Management" }]);
  return <p>Organization page</p>;
}

function renderShell(url = "/admin") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/admin" element={<AdminShell />}>
              <Route index element={<p>Overview page</p>} />
              <Route path="issues" element={<p>Issues page</p>} />
              <Route path="settings" element={<p>Settings page</p>} />
              <Route path="organizations/:orgId" element={<Page />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const notFound: [number, unknown] = [404, { error: "Not found" }];

afterEach(() => vi.unstubAllGlobals());

describe("AdminShell", () => {
  it("shows the sidebar sections with counts from the API and marks the current one", async () => {
    mockFetch((url) => (url === "/api/admin/nav-counts" ? [200, { openReports: 7, newViolations: 12, newQuotes: 0 }] : notFound));
    renderShell("/admin/issues");
    const nav = screen.getAllByRole("navigation", { name: "Admin Portal" })[0];
    expect(within(nav).getByRole("link", { name: /^Issues/ })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: /^Overview/ })).not.toHaveAttribute("aria-current");
    expect(await within(nav).findByRole("link", { name: "Violations, 12 new" })).toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: "Issues, 7 open" })).toBeInTheDocument();
    // No badge for zero, and Properties now live inside Organizations.
    expect(within(nav).getByRole("link", { name: "Quotes" })).toBeInTheDocument();
    expect(within(nav).queryByRole("link", { name: /Properties/ })).not.toBeInTheDocument();
    expect(within(nav).getByText("Phase 2")).toBeInTheDocument();
  });

  it("leaves the badges off until the API serves them", async () => {
    const calls = mockFetch(() => notFound);
    renderShell();
    await waitFor(() => expect(calls.some((c) => c.url === "/api/admin/nav-counts")).toBe(true));
    const nav = screen.getAllByRole("navigation", { name: "Admin Portal" })[0];
    expect(within(nav).getByRole("link", { name: "Violations" })).toBeInTheDocument();
  });

  it("builds the breadcrumb from the page, falling back to the section", async () => {
    mockFetch(() => notFound);
    const { unmount } = renderShell("/admin/issues");
    expect(within(screen.getByRole("navigation", { name: "Breadcrumb" })).getByText("Issues")).toHaveAttribute("aria-current", "page");
    unmount();

    renderShell("/admin/organizations/org1");
    const crumb = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(await within(crumb).findByText("Demo Management")).toHaveAttribute("aria-current", "page");
    expect(within(crumb).getByRole("link", { name: "Organizations" })).toHaveAttribute("href", "/admin/organizations");
    expect(document.title).toBe("Demo Management | CBES Admin");
  });

  it("opens search with Ctrl+K and closes it with Ctrl+K again", async () => {
    const calls = mockFetch(() => [200, { results: [] }]);
    renderShell();
    await userEvent.keyboard("{Control>}k{/Control}");
    const dialog = screen.getByRole("dialog", { name: "Search the Admin Portal" });
    const box = within(dialog).getByRole("combobox", { name: "Search" });
    expect(box).toHaveFocus();
    await userEvent.type(box, "412");
    expect(await within(dialog).findByText(/Nothing matches “412”/)).toBeInTheDocument();
    expect(calls.some((c) => c.url === "/api/admin/search?q=412")).toBe(true);
    await userEvent.keyboard("{Control>}k{/Control}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await userEvent.keyboard("{Meta>}k{/Meta}");
    expect(screen.getByRole("dialog", { name: "Search the Admin Portal" })).toBeInTheDocument();
  });

  it("closes search with the X button", async () => {
    mockFetch(() => [200, { results: [] }]);
    renderShell();
    await userEvent.keyboard("{Control>}k{/Control}");
    await userEvent.click(screen.getByRole("button", { name: "Close search" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes search with Escape while results are showing", async () => {
    const results = [{ kind: "org", id: "o1", title: "Peachtree Residential", subtitle: "6 properties", link: "/admin/organizations/o1" }];
    mockFetch((url) => (url.startsWith("/api/admin/search?q=pea") ? [200, { results }] : [200, { results: [] }]));
    renderShell();
    await userEvent.keyboard("{Control>}k{/Control}");
    await userEvent.type(screen.getByRole("combobox"), "pea");
    expect(await screen.findByRole("option", { name: /Peachtree Residential/ })).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveAttribute("aria-expanded", "true");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("finds the portal's own pages and goes to one", async () => {
    mockFetch(() => [200, { results: [] }]);
    renderShell();
    await userEvent.keyboard("{Control>}k{/Control}");
    await userEvent.type(screen.getByRole("combobox"), "sett");
    const pages = within(await screen.findByRole("group", { name: "Pages" })).getAllByRole("option");
    expect(pages.map((o) => o.querySelector("span")?.textContent)).toEqual(["Settings", "Account settings"]);
    await userEvent.keyboard("{Enter}");
    expect(await screen.findByText("Settings page")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("groups search results and opens one with the keyboard", async () => {
    const results = [
      { kind: "property", id: "p1", title: "The Oaks at Decatur", subtitle: "Peachtree Residential", link: "/admin/organizations/o1/properties/p1" },
      { kind: "org", id: "o1", title: "Peachtree Residential", subtitle: "6 properties", link: "/admin/organizations/o1" },
    ];
    mockFetch((url) => (url.startsWith("/api/admin/search?q=oak") ? [200, { results }] : notFound));
    renderShell();
    await userEvent.click(screen.getAllByRole("button", { name: /Search/ })[0]);
    await userEvent.type(screen.getByRole("combobox"), "oak");
    const options = await screen.findAllByRole("option");
    // Organizations come before Properties, whatever order the API used.
    expect(options.map((o) => o.textContent)).toEqual(["Peachtree Residential6 properties", "The Oaks at DecaturPeachtree Residential"]);
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(await screen.findByText("Organization page")).toBeInTheDocument();
  });

  it("lists notifications and marks them read", async () => {
    const items = [{ id: "n1", kind: "violation_note", title: "Dana mentioned you on V-2041", body: "Photo looks right.", link: "/admin/issues", readAt: null, createdAt: new Date().toISOString() }];
    const calls = mockFetch((url, method) =>
      url === "/api/notifications" ? [200, { items, unread: 1 }] : url === "/api/notifications/read" && method === "POST" ? [204, null] : notFound,
    );
    renderShell();
    const bell = await screen.findByRole("button", { name: "Notifications, 1 unread" });
    await userEvent.click(bell);
    const panel = screen.getByRole("dialog", { name: "Notifications" });
    await userEvent.click(within(panel).getByRole("button", { name: "Mark all read" }));
    await waitFor(() => expect(calls.find((c) => c.url === "/api/notifications/read")?.body).toEqual({}));
    await userEvent.click(within(panel).getByRole("link", { name: /Dana mentioned you/ }));
    expect(await screen.findByText("Issues page")).toBeInTheDocument();
    expect(calls.filter((c) => c.url === "/api/notifications/read").at(-1)?.body).toEqual({ ids: ["n1"] });
  });

  it("opens the menu as a drawer on small screens and closes it with Escape", async () => {
    mockFetch(() => notFound);
    renderShell();
    const open = screen.getByRole("button", { name: "Open menu" });
    await userEvent.click(open);
    const drawer = screen.getByRole("dialog", { name: "Menu" });
    await userEvent.click(within(drawer).getByRole("link", { name: "Issues" }));
    expect(screen.queryByRole("dialog", { name: "Menu" })).not.toBeInTheDocument();
    expect(screen.getByText("Issues page")).toBeInTheDocument();

    await userEvent.click(open);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Menu" })).not.toBeInTheDocument();
    expect(open).toHaveFocus();
  });
});
