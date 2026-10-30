import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockFetch } from "../../test/render";
import { ToastProvider } from "../Toast";
import { usePortalPage } from "../admin/adminPage";
import { CONTEXT_KEY } from "./context";
import { RepShell } from "./RepShell";

const org = (id: string, name: string, propertyCount = 2) => ({ id, name, propertyCount, propertyLimit: 100, logoVersion: null });
const prop = (id: string, name: string, organizationId = "org1", organizationName = "Peachtree Residential") => ({
  id,
  name,
  slug: id,
  city: null,
  organizationId,
  organizationName,
  photoVersion: null,
});

const repMe = (organizations = [org("org1", "Peachtree Residential")]) => ({
  user: { id: "u1", email: "lauren@peachtree.com", name: "Lauren Kim", role: "representative" },
  organizations,
  properties: [prop("p1", "The Oaks at Decatur"), prop("p2", "Willow Bend"), prop("p9", "Elsewhere Place", "org2", "Elsewhere Living")],
});
const managerMe = (properties = [prop("p1", "The Oaks at Decatur")]) => ({
  user: { id: "u2", email: "chris@peachtree.com", name: "Chris Patel", role: "manager" },
  organizations: [],
  properties: properties.map((p) => ({ ...p, memberRole: "manager" })),
});
const counts = { violationsToReview: 5, openIssues: 3, pendingInvitations: 1 };

function Item() {
  usePortalPage("V-2041 Bag not tied", [{ label: "Violations", to: "/portal/violations" }, { label: "V-2041" }]);
  return <p>Violation page</p>;
}

function Where() {
  const l = useLocation();
  return <output data-testid="location">{l.pathname + l.search}</output>;
}

function renderShell(url: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route element={<RepShell />}>
              <Route path="/portal" element={<p>Home page</p>} />
              <Route path="/portal/organizations/:orgId" element={<p>Dashboard page</p>} />
              <Route path="/portal/organizations/:orgId/settings" element={<p>Settings page</p>} />
              <Route path="/portal/properties/:propertyId" element={<p>Property page</p>} />
              <Route path="/portal/violations" element={<p>Violations page</p>} />
              <Route path="/portal/violations/:violationId" element={<Item />} />
              <Route path="/portal/settings" element={<p>Account page</p>} />
            </Route>
          </Routes>
          <Where />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

function api(me: unknown, extra: (url: string) => [number, unknown] | undefined = () => undefined) {
  return mockFetch((url) => {
    const hit = extra(url);
    if (hit) return hit;
    if (url === "/api/portal/me") return [200, me];
    if (url.startsWith("/api/portal/nav-counts")) return [200, counts];
    if (url === "/api/notifications") return [200, { items: [], unread: 0 }];
    return [404, { error: "Not found" }];
  });
}

const sidebar = () => screen.getAllByRole("navigation", { name: "Property Portal" })[0];

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("RepShell", () => {
  it("gives a Representative the organization's sidebar with badges scoped to it", async () => {
    vi.stubGlobal("__clerkRole", "representative");
    const calls = api(repMe());
    renderShell("/portal/organizations/org1");
    const nav = sidebar();
    expect(await within(nav).findByRole("link", { name: /^Dashboard/ })).toHaveAttribute("aria-current", "page");
    expect(await within(nav).findByRole("link", { name: "Violations, 5 to review" })).toHaveAttribute("href", "/portal/violations?org=org1");
    expect(within(nav).getByRole("link", { name: "Resident issues, 3 open" })).toHaveAttribute("href", "/portal/issues?org=org1");
    expect(within(nav).getByRole("link", { name: "Reports" })).toHaveAttribute("href", "/portal/reports?scope=organization&org=org1");
    expect(within(nav).getByRole("link", { name: "Team and settings, 1 waiting" })).toHaveAttribute("href", "/portal/organizations/org1/settings");
    expect(within(nav).getByText("Peachtree Residential")).toBeInTheDocument();
    expect(within(nav).getByText("2 properties · Representative")).toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: "office@cbenvironments.com" })).toHaveAttribute("href", "mailto:office@cbenvironments.com");
    expect(calls.some((c) => c.url === "/api/portal/nav-counts?org=org1")).toBe(true);
  });

  it("gives a property manager the property's sidebar and never Team and settings", async () => {
    vi.stubGlobal("__clerkRole", "manager");
    const calls = api(managerMe());
    renderShell("/portal/properties/p1");
    const nav = sidebar();
    expect(await within(nav).findByRole("link", { name: /^My property/ })).toHaveAttribute("aria-current", "page");
    expect(await within(nav).findByRole("link", { name: "Violations, 5 to review" })).toHaveAttribute("href", "/portal/violations?property=p1");
    expect(within(nav).getByRole("link", { name: "My account" })).toHaveAttribute("href", "/portal/account");
    expect(within(nav).queryByRole("link", { name: /Team and settings/ })).not.toBeInTheDocument();
    expect(within(nav).queryByRole("link", { name: /Overwatch/ })).not.toBeInTheDocument();
    expect(within(nav).getByText("Overwatch").closest("[aria-disabled]")).toHaveAttribute("aria-disabled", "true");
    expect(within(nav).getByText("Phase 2")).toBeInTheDocument();
    // One property: the switcher is a plain label.
    expect(within(nav).queryByRole("button", { name: /Switch property/ })).not.toBeInTheDocument();
    expect(calls.some((c) => c.url === "/api/portal/nav-counts?property=p1")).toBe(true);
  });

  it("gives valets and Stewards only their account, and no search", async () => {
    vi.stubGlobal("__clerkRole", "valet");
    const calls = api({ user: { id: "u3", email: "v@cbes.com", name: "Val", role: "valet" }, organizations: [], properties: [] });
    renderShell("/portal");
    const nav = sidebar();
    expect(await within(nav).findByRole("link", { name: "Account settings" })).toHaveAttribute("href", "/portal/settings");
    expect(within(nav).queryByRole("link", { name: /Violations/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Search" })).not.toBeInTheDocument();
    await waitFor(() => expect(calls.some((c) => c.url === "/api/portal/me")).toBe(true));
    expect(calls.some((c) => c.url.startsWith("/api/portal/nav-counts"))).toBe(false);
  });

  it("switches organization, keeping the page, and remembers the choice", async () => {
    vi.stubGlobal("__clerkRole", "representative");
    api(repMe([org("org1", "Peachtree Residential"), org("org2", "Elsewhere Living", 1)]));
    renderShell("/portal/organizations/org1/settings");
    await userEvent.click(await within(sidebar()).findByRole("button", { name: /^Peachtree Residential.*Switch organization$/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Elsewhere Living" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/portal/organizations/org2/settings");
    expect(JSON.parse(localStorage.getItem(CONTEXT_KEY) ?? "{}")).toMatchObject({ orgId: "org2" });
    expect(await within(sidebar()).findByRole("link", { name: /^Violations/ })).toHaveAttribute("href", "/portal/violations?org=org2");
  });

  it("opens the last property used when the URL doesn't say", async () => {
    vi.stubGlobal("__clerkRole", "manager");
    localStorage.setItem(CONTEXT_KEY, JSON.stringify({ propertyId: "p2" }));
    api(managerMe([prop("p1", "The Oaks at Decatur"), prop("p2", "Willow Bend")]));
    renderShell("/portal/settings");
    expect(await within(sidebar()).findByRole("link", { name: /^My property/ })).toHaveAttribute("href", "/portal/properties/p2");
    expect(within(sidebar()).getByRole("button", { name: /^Willow Bend.*Switch property$/ })).toBeInTheDocument();
  });

  it("builds the breadcrumb from the context and the page, and titles the tab", async () => {
    vi.stubGlobal("__clerkRole", "manager");
    api(managerMe());
    renderShell("/portal/violations/v1");
    const crumb = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(await within(crumb).findByRole("link", { name: "The Oaks at Decatur" })).toHaveAttribute("href", "/portal/properties/p1");
    expect(within(crumb).getByRole("link", { name: "Violations" })).toHaveAttribute("href", "/portal/violations");
    expect(within(crumb).getByText("V-2041")).toHaveAttribute("aria-current", "page");
    expect(document.title).toBe("V-2041 Bag not tied | CBES Portal");
  });

  it("searches the Property Portal with Ctrl+K", async () => {
    vi.stubGlobal("__clerkRole", "representative");
    const calls = api(repMe(), (url) =>
      url.startsWith("/api/portal/search")
        ? [200, { results: [{ kind: "violation", id: "v1", title: "V-2041 · Bag not tied", subtitle: "The Oaks at Decatur · Unit 204 · To review", link: "/portal/violations/v1" }] }]
        : undefined,
    );
    renderShell("/portal/organizations/org1");
    await within(sidebar()).findByRole("link", { name: /^Dashboard/ });
    await userEvent.keyboard("{Control>}k{/Control}");
    const dialog = screen.getByRole("dialog", { name: "Search the Property Portal" });
    await userEvent.type(within(dialog).getByRole("combobox"), "V-2041");
    await userEvent.click(await within(dialog).findByRole("option", { name: /V-2041 · Bag not tied/ }));
    expect(calls.some((c) => c.url === "/api/portal/search?q=V-2041")).toBe(true);
    expect(calls.some((c) => c.url.startsWith("/api/admin/search"))).toBe(false);
    expect(screen.getByTestId("location")).toHaveTextContent("/portal/violations/v1");
  });

  it("finds the sidebar's pages in search", async () => {
    vi.stubGlobal("__clerkRole", "representative");
    api(repMe(), (url) => (url.startsWith("/api/portal/search") ? [200, { results: [] }] : undefined));
    renderShell("/portal/organizations/org1");
    await within(sidebar()).findByRole("link", { name: /^Dashboard/ });
    await userEvent.keyboard("{Control>}k{/Control}");
    await userEvent.type(screen.getByRole("combobox"), "team");
    expect(await screen.findByRole("option", { name: /Team and settings/ })).toBeInTheDocument();
  });

  it("shows Super Admins a preview banner with a way back to the admin property page", async () => {
    vi.stubGlobal("__clerkRole", "super_admin");
    api({ user: { id: "u0", email: "nick@cbes.com", name: "Nick", role: "admin" }, organizations: [], properties: [prop("p1", "The Oaks at Decatur")] });
    renderShell("/portal/properties/p1?as=manager");
    expect(await screen.findByText("Previewing as a property manager. Changes are turned off.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Exit preview" })).toHaveAttribute("href", "/admin/organizations/org1/properties/p1");
    // The preview shows the manager's sidebar.
    expect(within(sidebar()).getByRole("link", { name: /^My property/ })).toBeInTheDocument();
  });

  it("opens the menu as a drawer on small screens and closes it after navigating", async () => {
    vi.stubGlobal("__clerkRole", "representative");
    api(repMe());
    renderShell("/portal/organizations/org1");
    await userEvent.click(screen.getByRole("button", { name: "Open menu" }));
    const drawer = screen.getByRole("dialog", { name: "Menu" });
    await userEvent.click(await within(drawer).findByRole("link", { name: /^Violations/ }));
    expect(screen.queryByRole("dialog", { name: "Menu" })).not.toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/portal/violations?org=org1");
  });
});
