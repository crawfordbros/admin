import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { cx } from "./styles";

type TriggerProps = { "aria-expanded": boolean; "aria-controls": string; "aria-haspopup": "dialog" | "menu"; onClick: () => void };

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
}: {
  trigger: (props: TriggerProps) => ReactNode;
  children: (close: () => void) => ReactNode;
  label: string;
  align?: "start" | "end";
  width?: number;
  haspopup?: "dialog" | "menu";
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && open) {
      e.stopPropagation();
      setOpen(false);
      root.current?.querySelector<HTMLElement>("[aria-controls]")?.focus();
    }
  };

  return (
    <div
      ref={root}
      className="relative"
      onKeyDown={onKeyDown}
      onBlur={(e) => open && !root.current?.contains(e.relatedTarget as Node) && e.relatedTarget && setOpen(false)}
    >
      {trigger({ "aria-expanded": open, "aria-controls": id, "aria-haspopup": haspopup, onClick: () => setOpen((o) => !o) })}
      {open && (
        <div
          id={id}
          role={haspopup === "menu" ? undefined : "dialog"}
          aria-label={label}
          style={{ width }}
          className={cx(
            "anim-fade absolute top-full z-40 mt-2 max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-white shadow-[0_12px_32px_rgba(26,28,94,0.16)]",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          {children(close)}
        </div>
      )}
    </div>
  );
}

export type MenuItem = { label: string; to?: string; onSelect?: () => void; tone?: "danger"; disabled?: boolean };

/** A row-action menu: arrow keys move between items, Enter or Space picks one. */
export function Menu({ label, items, trigger }: { label: string; items: MenuItem[]; trigger: (props: TriggerProps) => ReactNode }) {
  return (
    <Popover label={label} trigger={trigger} haspopup="menu" align="end" width={220}>
      {(close) => <MenuList label={label} items={items} close={close} />}
    </Popover>
  );
}

function MenuList({ label, items, close }: { label: string; items: MenuItem[]; close: () => void }) {
  const list = useRef<HTMLUListElement>(null);
  const enabled = () => [...(list.current?.querySelectorAll<HTMLElement>("[role=menuitem]:not([aria-disabled=true])") ?? [])];
  useEffect(() => {
    enabled()[0]?.focus();
  }, []);

  const move = (e: KeyboardEvent) => {
    const els = enabled();
    const at = els.indexOf(document.activeElement as HTMLElement);
    const next = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: els.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    els[(next + els.length) % els.length]?.focus();
  };

  return (
    <ul ref={list} role="menu" aria-label={label} onKeyDown={move} className="m-0 list-none p-1.5">
      {items.map((item) => {
        const cls = cx(
          "flex min-h-10 w-full items-center rounded-lg px-3 text-left text-[14px] font-semibold no-underline focus:bg-canvas focus:outline-none hover:bg-canvas",
          item.tone === "danger" ? "text-danger hover:text-danger" : "text-ink hover:text-ink",
          item.disabled && "cursor-not-allowed opacity-50",
        );
        return (
          <li key={item.label} role="none">
            {item.to && !item.disabled ? (
              <Link role="menuitem" tabIndex={-1} to={item.to} className={cls} onClick={close}>
                {item.label}
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
                {item.label}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
