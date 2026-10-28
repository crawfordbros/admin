import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { Icon, type IconName } from "./icons";
import { cx } from "./styles";

/** A row of mutually exclusive buttons, such as Today / 7 days / 30 days. */
export function SegmentedControl<V extends string>({
  options,
  value,
  onChange,
  label,
  size = "md",
}: {
  options: { value: V; label: string; icon?: IconName }[];
  value: V;
  onChange: (value: V) => void;
  label: string;
  size?: "md" | "sm";
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-[10px] border border-line bg-white p-[3px]">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            aria-label={o.icon ? o.label : undefined}
            onClick={() => onChange(o.value)}
            className={cx(
              "inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold",
              size === "sm" ? "h-8 min-w-[34px] px-2 text-[13px]" : "h-9 px-3 text-[13px]",
              on ? "bg-navy text-white" : "text-muted hover:bg-canvas hover:text-ink",
            )}
          >
            {o.icon ? <Icon name={o.icon} size={16} strokeWidth={2} /> : o.label}
          </button>
        );
      })}
    </div>
  );
}

export type TabDef<V extends string> = { value: V; label: string; count?: number | string };

/**
 * Tabs that switch what a page shows. `pill` is the filled style used above tables, `underline`
 * the style under a detail page's header. Arrow keys move between tabs; the panel is the caller's.
 */
export function Tabs<V extends string>({
  tabs,
  value,
  onChange,
  label,
  variant = "pill",
  idPrefix,
}: {
  tabs: TabDef<V>[];
  value: V;
  onChange: (value: V) => void;
  label: string;
  variant?: "pill" | "underline";
  /** Gives each tab an id (`${idPrefix}-tab-${value}`) and aria-controls (`${idPrefix}-panel`). */
  idPrefix?: string;
}) {
  const list = useRef<HTMLDivElement>(null);
  const onKeyDown = (e: KeyboardEvent) => {
    const at = tabs.findIndex((t) => t.value === value);
    const next = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const tab = tabs[(next + tabs.length) % tabs.length];
    onChange(tab.value);
    list.current?.querySelector<HTMLElement>(`[data-value="${tab.value}"]`)?.focus();
  };
  const pill = variant === "pill";

  return (
    <div ref={list} role="tablist" aria-label={label} onKeyDown={onKeyDown} className={cx("flex overflow-x-auto", pill ? "gap-1.5" : "gap-1")}>
      {tabs.map((t) => {
        const on = t.value === value;
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            id={idPrefix && `${idPrefix}-tab-${t.value}`}
            aria-controls={idPrefix && `${idPrefix}-panel`}
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            data-value={t.value}
            onClick={() => onChange(t.value)}
            className={cx(
              "flex flex-none items-center gap-1.5 text-[13px] whitespace-nowrap",
              pill
                ? cx("h-9 rounded-[9px] px-3", on ? "bg-navy-ink font-bold text-white" : "bg-canvas font-semibold text-ink hover:bg-tint-2")
                : cx("border-b-[3px] px-3 py-3.5 text-[14px]", on ? "border-navy font-bold text-navy-ink" : "border-transparent font-semibold text-muted hover:text-ink"),
            )}
          >
            {t.label}
            {t.count !== undefined && t.count !== "" && " "}
            {t.count !== undefined && t.count !== "" && (
              <span
                className={cx(
                  "rounded-full px-1.5 py-px text-[11px] font-bold",
                  pill && on ? "bg-white text-navy-ink" : "bg-line text-muted",
                )}
              >
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (checked: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        "relative inline-flex h-6 w-11 flex-none items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-navy" : "bg-field",
      )}
    >
      <span className={cx("absolute size-[18px] rounded-full bg-white shadow-sm transition-[left]", checked ? "left-[23px]" : "left-[3px]")} />
    </button>
  );
}

export type Step = { label: string; sub?: ReactNode; state: "done" | "current" | "todo" };

/** Progress through a fixed sequence, such as a violation's review steps. */
export function Stepper({ steps, label }: { steps: Step[]; label: string }) {
  return (
    <ol aria-label={label} className="m-0 flex list-none flex-wrap gap-x-2 gap-y-4 p-0">
      {steps.map((s, i) => (
        <li key={s.label} aria-current={s.state === "current" ? "step" : undefined} className="flex min-w-0 flex-[1_1_160px] items-center gap-2">
          <span
            className={cx(
              "flex size-[30px] flex-none items-center justify-center rounded-full text-[13px] font-bold",
              s.state === "done" && "bg-success text-white",
              s.state === "current" && "bg-navy text-white shadow-[0_0_0_4px_#e3e4f6]",
              s.state === "todo" && "bg-neutral-bg text-muted",
            )}
          >
            {s.state === "done" ? <Icon name="check" size={15} strokeWidth={2.6} /> : i + 1}
            <span className="sr-only">{s.state === "done" ? " (done)" : s.state === "current" ? " (current)" : ""}</span>
          </span>
          <span className="min-w-0">
            <span className="block text-[13.5px] font-bold">{s.label}</span>
            {s.sub && <span className="block text-[12px] text-muted">{s.sub}</span>}
          </span>
          {i < steps.length - 1 && <span aria-hidden="true" className={cx("h-0.5 min-w-4 flex-1", s.state === "done" ? "bg-success" : "bg-line")} />}
        </li>
      ))}
    </ol>
  );
}
