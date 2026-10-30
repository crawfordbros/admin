import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { cx } from "./styles";

type TriggerProps = { "aria-expanded": boolean; "aria-controls": string; "aria-haspopup": "dialog" | "menu"; onClick: () => void };

/** Position against the viewport, outside any table or card that clips its children. */
function positionPanel(anchor: HTMLElement, panel: HTMLElement, width: number, align: "start" | "end") {
  const rect = anchor.getBoundingClientRect();
  const viewport = window.visualViewport;
  const left = viewport?.offsetLeft ?? 0;
  const top = viewport?.offsetTop ?? 0;
  const right = left + (viewport?.width ?? window.innerWidth);
  const bottom = top + (viewport?.height ?? window.innerHeight);
  const visible = { left, top, right, bottom };

  for (let parent = anchor.parentElement; parent; parent = parent.parentElement) {
    const style = getComputedStyle(parent);
    const bounds = parent.getBoundingClientRect();
    if (/auto|scroll|hidden|clip/.test(style.overflowX)) {
      visible.left = Math.max(visible.left, bounds.left + parent.clientLeft);
      visible.right = Math.min(visible.right, bounds.left + parent.clientLeft + parent.clientWidth);
    }
    if (/auto|scroll|hidden|clip/.test(style.overflowY)) {
      visible.top = Math.max(visible.top, bounds.top + parent.clientTop);
      visible.bottom = Math.min(visible.bottom, bounds.top + parent.clientTop + parent.clientHeight);
    }
  }
  if ((rect.width || rect.height) && (rect.right <= visible.left || rect.left >= visible.right || rect.bottom <= visible.top || rect.top >= visible.bottom)) return false;

  const panelWidth = Math.min(width, Math.max(0, right - left - 32));
  panel.style.width = `${panelWidth}px`;
  const height = panel.scrollHeight + panel.offsetHeight - panel.clientHeight;
  const below = Math.max(0, bottom - 16 - rect.bottom - 8);
  const above = Math.max(0, rect.top - 8 - top - 16);
  const upwards = height > below && above > below;
  const available = upwards ? above : below;
  panel.style.maxHeight = `${available}px`;
  panel.style.left = `${Math.max(left + 16, Math.min(align === "end" ? rect.right - panelWidth : rect.left, right - 16 - panelWidth))}px`;
  panel.style.top = `${Math.max(top + 16, upwards ? rect.top - 8 - Math.min(height, available) : rect.bottom + 8)}px`;
  return true;
}

/**
 * A panel anchored under its trigger. Closes on Escape, on a click outside, and when focus
 * leaves it; Escape returns focus to the trigger.
 */
export function Popover({
  trigger,
  children,
  label,
  align = "start",
  width = 320,
  haspopup = "dialog",
  portal = false,
}: {
  trigger: (props: TriggerProps) => ReactNode;
  children: (close: () => void) => ReactNode;
  label: string;
  align?: "start" | "end";
  width?: number;
  haspopup?: "dialog" | "menu";
  portal?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const focusTrigger = () => root.current?.querySelector<HTMLElement>("[aria-controls]")?.focus({ preventScroll: true });
  const close = () => {
    // A dialog opened by onSelect must capture the persistent trigger as its opener.
    if (haspopup === "menu") focusTrigger();
    setOpen(false);
  };

  useLayoutEffect(() => {
    if (!open || !portal) return;
    const anchor = root.current?.querySelector<HTMLElement>("[aria-controls]");
    const floating = panel.current;
    if (!anchor || !floating) return;
    let frame = 0;
    const update = () => {
      if (!positionPanel(anchor, floating, width, align)) setOpen(false);
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    update();
    // Capture scrolls from the table and other ancestors, but not within the menu itself.
    const onScroll = (event: Event) => {
      if (!floating.contains(event.target as Node)) schedule();
    };
    document.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(schedule);
    observer?.observe(anchor);
    observer?.observe(floating);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
    };
  }, [open, portal, width, align]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node) && !panel.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && open) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      focusTrigger();
    }
    if (e.key === "Tab" && open && haspopup === "menu") {
      // Let the browser's default Tab action continue from the trigger's DOM position.
      close();
    }
  };

  const content = open && (
    <div
      ref={panel}
      id={id}
      role={haspopup === "menu" ? undefined : "dialog"}
      aria-label={label}
      style={{ width }}
      onClick={(e) => e.stopPropagation()}
      className={cx(
        "anim-fade z-40 max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-white shadow-[0_12px_32px_rgba(26,28,94,0.16)]",
        portal ? "fixed overflow-y-auto overscroll-contain" : cx("absolute top-full mt-2", align === "end" ? "right-0" : "left-0"),
      )}
    >
      {/* eslint-disable-next-line react-hooks/refs -- The render prop receives a callback that only reads refs when an action is selected. */}
      {children(close)}
    </div>
  );

  return (
    <div
      ref={root}
      className="relative"
      onKeyDown={onKeyDown}
      onBlur={(e) => {
        if (open && e.relatedTarget && !root.current?.contains(e.relatedTarget as Node) && !panel.current?.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      {trigger({ "aria-expanded": open, "aria-controls": id, "aria-haspopup": haspopup, onClick: () => setOpen((o) => !o) })}
      {portal ? open && createPortal(content, document.body) : content}
    </div>
  );
}

export type MenuItem = { label: string; id?: string; description?: string; to?: string; onSelect?: () => void; tone?: "danger"; disabled?: boolean };

/** A row-action menu: arrow keys move between items, Enter or Space picks one. */
export function Menu({ label, items, trigger }: { label: string; items: MenuItem[]; trigger: (props: TriggerProps) => ReactNode }) {
  return (
    <Popover label={label} trigger={trigger} haspopup="menu" align="end" width={220} portal>
      {(close) => <MenuList label={label} items={items} close={close} />}
    </Popover>
  );
}

export function MenuList({ label, items, close }: { label: string; items: MenuItem[]; close: () => void }) {
  const list = useRef<HTMLUListElement>(null);
  const enabled = () => [...(list.current?.querySelectorAll<HTMLElement>("[role=menuitem]:not([aria-disabled=true])") ?? [])];
  useEffect(() => {
    (enabled()[0] ?? list.current)?.focus({ preventScroll: true });
  }, []);

  const move = (e: KeyboardEvent) => {
    if (e.key === " " && (e.target as HTMLElement).matches("a[role=menuitem]")) {
      e.preventDefault();
      (e.target as HTMLElement).click();
      return;
    }
    const els = enabled();
    const at = els.indexOf(document.activeElement as HTMLElement);
    const next = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: els.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    els[(next + els.length) % els.length]?.focus();
  };

  return (
    <ul ref={list} role="menu" tabIndex={-1} aria-label={label} onKeyDown={move} className="m-0 list-none p-1.5 focus:outline-none">
      {items.map((item) => {
        const cls = cx(
          "flex min-h-10 w-full items-center rounded-lg px-3 text-left text-[14px] font-semibold no-underline focus:bg-canvas focus:outline-none hover:bg-canvas",
          item.tone === "danger" ? "text-danger hover:text-danger" : "text-ink hover:text-ink",
          item.disabled && "cursor-not-allowed opacity-50",
        );
        return (
          <li key={item.id ?? item.label} role="none">
            {item.to && !item.disabled ? (
              <Link role="menuitem" tabIndex={-1} to={item.to} className={cls} onClick={close}>
                <span>{item.label}{item.description && <span className="block whitespace-normal break-words text-[12px] font-normal text-muted">{item.description}</span>}</span>
              </Link>
            ) : (
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                aria-disabled={item.disabled || undefined}
                className={cls}
                onClick={() => {
                  if (item.disabled) return;
                  close();
                  item.onSelect?.();
                }}
              >
                <span>{item.label}{item.description && <span className="block whitespace-normal break-words text-[12px] font-normal text-muted">{item.description}</span>}</span>
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
