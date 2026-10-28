import { useState } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Menu, Popover, type MenuItem } from "./Popover";
import { Modal } from "./overlay";

afterEach(() => vi.restoreAllMocks());

function Harness({ items = [{ label: "First" }, { label: "Disabled", disabled: true }, { label: "Last" }] }: { items?: MenuItem[] }) {
  return (
    <MemoryRouter>
      <button>Before</button>
      <section data-testid="card" style={{ overflow: "hidden" }}>
        <Menu label="Actions" items={items} trigger={(props) => <button {...props}>Options</button>} />
      </section>
      <button>After</button>
    </MemoryRouter>
  );
}

describe("portaled menus", () => {
  it("renders outside the clipping card, skips disabled actions, and restores focus on Escape", async () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Options" });
    await userEvent.click(trigger);
    const menu = screen.getByRole("menu");
    expect(screen.getByTestId("card")).not.toContainElement(menu);
    expect(menu.parentElement?.parentElement).toBe(document.body);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(trigger).toHaveAttribute("aria-controls", menu.parentElement?.id);
    expect(screen.getByRole("menuitem", { name: "First" })).toHaveFocus();
    await userEvent.keyboard("{End}");
    expect(screen.getByRole("menuitem", { name: "Last" })).toHaveFocus();
    await userEvent.keyboard("{ArrowUp}");
    expect(screen.getByRole("menuitem", { name: "First" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("dismisses with Tab in the trigger's tab order and preserves outside-click focus", async () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Options" });
    await userEvent.click(trigger);
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "After" })).toHaveFocus();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await userEvent.click(trigger);
    await userEvent.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Before" })).toHaveFocus();
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("button", { name: "After" }));
    expect(screen.getByRole("button", { name: "After" })).toHaveFocus();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("keeps disabled actions inert and supports an all-disabled menu", async () => {
    const select = vi.fn();
    render(<Harness items={[{ label: "Disabled", disabled: true, onSelect: select }]} />);
    await userEvent.click(screen.getByRole("button", { name: "Options" }));
    expect(screen.getByRole("menu")).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}{Home}{End}");
    await userEvent.click(screen.getByRole("menuitem"));
    await userEvent.keyboard("{Enter}");
    expect(select).not.toHaveBeenCalled();
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Options" })).toHaveFocus();
  });

  it("supports Space on links and does not bubble menu clicks to clickable rows", async () => {
    const rowClick = vi.fn();
    function Location() { return <output>{useLocation().pathname}</output>; }
    render(
      <MemoryRouter>
        <div onClick={rowClick}>
          <Menu label="Actions" items={[{ label: "Open", to: "/destination" }]} trigger={(p) => <button {...p}>Options</button>} />
        </div>
        <Location />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Options" }));
    rowClick.mockClear();
    fireEvent.click(screen.getByRole("menu"));
    expect(rowClick).not.toHaveBeenCalled();
    await userEvent.keyboard(" ");
    expect(screen.getByRole("status")).toHaveTextContent("/destination");
    expect(rowClick).not.toHaveBeenCalled();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("hands focus to a dialog and restores it to the persistent trigger on close", async () => {
    function DialogHarness() {
      const [open, setOpen] = useState(false);
      return <><Harness items={[{ label: "Edit", onSelect: () => setOpen(true) }]} />{open && <Modal title="Edit user" onClose={() => setOpen(false)}><input aria-label="Name" /></Modal>}</>;
    }
    render(<DialogHarness />);
    const trigger = screen.getByRole("button", { name: "Options" });
    await userEvent.click(trigger);
    await userEvent.keyboard("{Enter}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(within(screen.getByRole("dialog")).getByLabelText("Name")).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
  });

  it("flips above, clamps to viewport margins, updates on resize, and cleans up observers", async () => {
    let onResize: ResizeObserverCallback = () => {};
    const disconnect = vi.fn();
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: ResizeObserverCallback) { onResize = callback; }
      observe = vi.fn();
      disconnect = disconnect;
    });
    const bounds = (x: number, y: number, width: number, height: number) => ({ x, y, left: x, top: y, right: x + width, bottom: y + height, width, height, toJSON: () => ({}) });
    let anchorY = window.innerHeight - 60;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return this.matches("[aria-controls]") ? bounds(20, anchorY, 36, 36) : bounds(0, 0, window.innerWidth, window.innerHeight);
    });
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(180);
    try {
      const view = render(<Harness />);
      await userEvent.click(screen.getByRole("button", { name: "Options" }));
      const panel = screen.getByRole("menu").parentElement!;
      expect(panel.style.left).toBe("16px");
      expect(Number.parseFloat(panel.style.top)).toBe(anchorY - 8 - 180);
      anchorY = 100;
      await act(async () => {
        onResize([], {} as ResizeObserver);
        await new Promise((resolve) => requestAnimationFrame(resolve));
      });
      expect(panel.style.top).toBe("144px");
      view.unmount();
      expect(disconnect).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("leaves ordinary popovers inline and usable", async () => {
    render(<Popover label="Filter" trigger={(p) => <button {...p}>Filter</button>}>{() => <input aria-label="Value" />}</Popover>);
    await userEvent.click(screen.getByRole("button", { name: "Filter" }));
    const dialog = screen.getByRole("dialog", { name: "Filter" });
    expect(dialog.parentElement).toContainElement(screen.getByRole("button", { name: "Filter" }));
    await userEvent.type(screen.getByLabelText("Value"), "example");
    expect(screen.getByLabelText("Value")).toHaveValue("example");
  });
});
