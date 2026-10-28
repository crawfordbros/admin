import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { niceMax, niceStep, sparkPath } from "./charts/scale";
import { Tabs } from "./controls";
import { DataTable } from "./DataTable";
import { FilterBar, type FilterDef, type FilterValue } from "./FilterBar";
import { Modal } from "./overlay";
import { Menu } from "./Popover";
import { avatarColor, initials } from "./displayUtils";

describe("Modal", () => {
  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          Add an admin
        </button>
        {open && (
          <Modal title="Add an admin" onClose={() => setOpen(false)} footer={<button type="button">Send invitation</button>}>
            <label>
              Email
              <input />
            </label>
          </Modal>
        )}
      </>
    );
  }

  it("focuses the first field, keeps Tab inside, and closes on Escape back to the opener", async () => {
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Add an admin" });
    await userEvent.click(opener);
    const dialog = screen.getByRole("dialog", { name: "Add an admin" });
    expect(within(dialog).getByLabelText("Email")).toHaveFocus();
    await userEvent.tab();
    expect(within(dialog).getByRole("button", { name: "Send invitation" })).toHaveFocus();
    await userEvent.tab();
    expect(within(dialog).getByRole("button", { name: "Close" })).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(within(dialog).getByRole("button", { name: "Send invitation" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });
});

describe("Menu", () => {
  it("moves through items with the arrow keys and runs the chosen one", async () => {
    const resend = vi.fn();
    render(
      <MemoryRouter>
        <Menu
          label="Actions for Pat"
          items={[{ label: "Open", to: "/x" }, { label: "Resend invitation", onSelect: resend }, { label: "Remove access", tone: "danger", disabled: true }]}
          trigger={(p) => (
            <button type="button" {...p}>
              Actions
            </button>
          )}
        />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Actions" }));
    expect(screen.getByRole("menuitem", { name: "Open" })).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Resend invitation" })).toHaveFocus();
    // The disabled item is skipped.
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Open" })).toHaveFocus();
    await userEvent.keyboard("{ArrowUp}{Enter}");
    expect(resend).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});

describe("Tabs", () => {
  it("selects with arrow keys", async () => {
    function Harness() {
      const [tab, setTab] = useState<"open" | "new" | "resolved">("open");
      return <Tabs label="Report status" value={tab} onChange={setTab} tabs={[{ value: "open", label: "Open", count: 7 }, { value: "new", label: "New" }, { value: "resolved", label: "Resolved" }]} />;
    }
    render(<Harness />);
    const open = screen.getByRole("tab", { name: "Open 7" });
    expect(open).toHaveAttribute("aria-selected", "true");
    open.focus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Resolved" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Resolved" })).toHaveFocus();
  });
});

describe("FilterBar", () => {
  const filters: FilterDef[] = [
    { key: "org", label: "Organization", type: "multi", options: [{ value: "o1", label: "Peachtree Residential" }, { value: "o2", label: "Magnolia Living" }] },
    { key: "status", label: "Status", type: "single", options: [{ value: "open", label: "Open" }] },
  ];

  function Harness({ onChange }: { onChange: (v: FilterValue) => void }) {
    const [value, setValue] = useState<FilterValue>({});
    return (
      <FilterBar
        filters={filters}
        value={value}
        onChange={(v) => {
          setValue(v);
          onChange(v);
        }}
      />
    );
  }

  it("applies filters from popovers and removes them from the chips", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /Organization: All/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Magnolia Living" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Peachtree Residential" }));
    expect(onChange).toHaveBeenLastCalledWith({ org: ["o2", "o1"] });
    await userEvent.keyboard("{Escape}");

    await userEvent.click(screen.getByRole("button", { name: /Status: All/ }));
    await userEvent.click(screen.getByRole("radio", { name: "Open" }));
    expect(onChange).toHaveBeenLastCalledWith({ org: ["o2", "o1"], status: ["open"] });

    const chips = screen.getByRole("list", { name: "Active filters" });
    await userEvent.click(within(chips).getByRole("button", { name: "Remove Organization filter Magnolia Living" }));
    expect(onChange).toHaveBeenLastCalledWith({ org: ["o1"], status: ["open"] });
    await userEvent.click(within(chips).getByRole("button", { name: "Clear all" }));
    expect(onChange).toHaveBeenLastCalledWith({});
    expect(screen.queryByRole("list", { name: "Active filters" })).not.toBeInTheDocument();
  });
});

describe("DataTable", () => {
  it("selects every row on the page and opens a row with Enter", async () => {
    const rows = [{ id: "a", name: "Unit 305" }, { id: "b", name: "Unit 118" }];
    const onSelect = vi.fn();
    const onRowClick = vi.fn();
    render(
      <DataTable
        label="Violations"
        rows={rows}
        rowKey={(r) => r.id}
        columns={[{ key: "name", header: "Unit", cell: (r) => r.name }]}
        selectable
        selected={new Set(["a"])}
        onSelect={onSelect}
        onRowClick={onRowClick}
        empty={<p>No violations</p>}
      />,
    );
    const all = screen.getByRole("checkbox", { name: "Select all on this page" }) as HTMLInputElement;
    expect(all.indeterminate).toBe(true);
    await userEvent.click(all);
    expect(onSelect).toHaveBeenLastCalledWith(new Set(["a", "b"]));
    const row = screen.getByText("Unit 118").closest("tr")!;
    row.focus();
    await userEvent.keyboard("{Enter}");
    expect(onRowClick).toHaveBeenCalledWith(rows[1]);
  });

  it("shows the empty state", () => {
    render(<DataTable label="Violations" rows={[]} rowKey={() => ""} columns={[]} empty={<p>No violations logged this week.</p>} />);
    expect(screen.getByText("No violations logged this week.")).toBeInTheDocument();
  });
});

describe("chart scales", () => {
  it("rounds the axis up to a labeled gridline", () => {
    expect(niceStep(41)).toBe(20);
    expect(niceMax(41, 10)).toBe(50);
    expect(niceStep(0)).toBe(1);
    expect(niceMax(0, 10)).toBe(10);
  });

  it("draws a flat line for equal values instead of dividing by zero", () => {
    expect(sparkPath([3, 3, 3], 84, 30)).toBe("M2.0 27.0 L42.0 27.0 L82.0 27.0");
    expect(sparkPath([0, 10], 84, 30)).toBe("M2.0 27.0 L82.0 3.0");
  });
});

describe("avatars", () => {
  it("uses two initials and a color that stays the same for a person", () => {
    expect(initials("Nick Crawford")).toBe("NC");
    expect(initials("dana")).toBe("D");
    expect(initials("  ")).toBe("?");
    expect(avatarColor("user_1")).toBe(avatarColor("user_1"));
  });
});
