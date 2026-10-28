import { useId, useState, type ReactNode } from "react";
import { Icon, type IconName } from "./icons";
import { Menu, Popover } from "./Popover";
import { cx } from "./styles";

export type FilterOption = { value: string; label: string };

export type FilterDef =
  | { key: string; label: string; icon?: IconName; type: "multi"; options: FilterOption[]; allLabel?: string }
  | { key: string; label: string; icon?: IconName; type: "single"; options: FilterOption[]; allLabel?: string }
  /** Presets plus a custom From/To. The value is [preset] or [from, to] (YYYY-MM-DD). */
  | { key: string; label: string; icon?: IconName; type: "date"; presets: FilterOption[]; allLabel?: string };

/** Each filter's chosen values; a missing or empty list means "all". */
export type FilterValue = Record<string, string[] | undefined>;

export type SavedView = { id: string; name: string };

const optionLabel = (def: FilterDef, v: string) => ("options" in def ? def.options : def.presets).find((o) => o.value === v)?.label ?? v;

function summary(def: FilterDef, values: string[]) {
  if (values.length === 0) return def.allLabel ?? "All";
  if (def.type === "date" && values.length === 2) return `${values[0]} to ${values[1]}`;
  if (values.length > 2) return `${optionLabel(def, values[0])} +${values.length - 1}`;
  return values.map((v) => optionLabel(def, v)).join(", ");
}

/**
 * A row of filter buttons. Each opens a popover with checkboxes, a radio list or a date range;
 * active filters are outlined and listed as removable chips below.
 */
export function FilterBar({
  filters,
  value,
  onChange,
  search,
  end,
  savedViews,
}: {
  filters: FilterDef[];
  value: FilterValue;
  onChange: (next: FilterValue) => void;
  /** A search field placed before the filters. */
  search?: ReactNode;
  /** Controls placed at the right end, such as a list/grid toggle. */
  end?: ReactNode;
  savedViews?: { views: SavedView[]; onApply: (id: string) => void; onSave: () => void };
}) {
  const set = (key: string, values: string[]) => onChange({ ...value, [key]: values.length ? values : undefined });
  const active = filters.filter((f) => (value[f.key]?.length ?? 0) > 0);

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2.5">
        {search}
        {filters.map((f) => (
          <FilterButton key={f.key} def={f} values={value[f.key] ?? []} onChange={(v) => set(f.key, v)} />
        ))}
        {savedViews && (
          <Menu
            label="Saved views"
            items={[
              ...savedViews.views.map((v) => ({ label: v.name, onSelect: () => savedViews.onApply(v.id) })),
              { label: "Save current filters", onSelect: savedViews.onSave },
            ]}
            trigger={(p) => (
              <button type="button" {...p} className="inline-flex h-[38px] items-center gap-1.5 rounded-[10px] px-2.5 text-[13px] font-semibold text-navy hover:bg-canvas">
                Saved views
                <Icon name="chevron-down" size={14} strokeWidth={2.2} />
              </button>
            )}
          />
        )}
        {end && <div className="ml-auto flex items-center gap-2">{end}</div>}
      </div>
      {active.length > 0 && (
        <ul aria-label="Active filters" className="m-0 flex list-none flex-wrap items-center gap-2 p-0">
          {active.flatMap((f) => {
            const vals = value[f.key] ?? [];
            const chips = f.type === "date" ? [{ v: vals.join("|"), text: summary(f, vals) }] : vals.map((v) => ({ v, text: optionLabel(f, v) }));
            return chips.map((c) => (
              <li key={`${f.key}:${c.v}`}>
                <span className="inline-flex h-8 items-center gap-1 rounded-full bg-tint-2 pr-1 pl-3 text-[12.5px] font-semibold text-navy-ink">
                  {f.type === "single" || f.type === "date" ? `${f.label}: ${c.text}` : c.text}
                  <button
                    type="button"
                    aria-label={`Remove ${f.label} filter ${c.text}`}
                    onClick={() => set(f.key, f.type === "multi" ? vals.filter((v) => v !== c.v) : [])}
                    className="flex size-6 items-center justify-center rounded-full hover:bg-white"
                  >
                    <Icon name="x" size={13} strokeWidth={2.4} />
                  </button>
                </span>
              </li>
            ));
          })}
          <li>
            <button type="button" onClick={() => onChange({})} className="h-8 px-2 text-[13px] font-bold text-navy hover:underline">
              Clear all
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}

function FilterButton({ def, values, onChange }: { def: FilterDef; values: string[]; onChange: (values: string[]) => void }) {
  const on = values.length > 0;
  return (
    <Popover
      label={`${def.label} filter`}
      width={def.type === "date" ? 300 : 260}
      trigger={(p) => (
        <button
          type="button"
          {...p}
          className={cx(
            "inline-flex h-[38px] max-w-full items-center gap-1.5 rounded-[10px] bg-white px-3 text-[13px] text-ink",
            on ? "border-[1.5px] border-navy bg-tint-2" : "border border-field hover:bg-canvas",
          )}
        >
          {def.icon && <Icon name={def.icon} size={15} strokeWidth={2} className="flex-none text-muted" />}
          <span className="font-semibold text-muted">{def.label}:</span>{" "}
          <strong className="truncate">{summary(def, values)}</strong>
          <Icon name="chevron-down" size={14} strokeWidth={2.2} />
        </button>
      )}
    >
      {(close) => <FilterPanel def={def} values={values} onChange={onChange} close={close} />}
    </Popover>
  );
}

function FilterPanel({ def, values, onChange, close }: { def: FilterDef; values: string[]; onChange: (values: string[]) => void; close: () => void }) {
  const name = useId();
  const [from, setFrom] = useState(def.type === "date" && values.length === 2 ? values[0] : "");
  const [to, setTo] = useState(def.type === "date" && values.length === 2 ? values[1] : "");
  const row = "flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-[14px] hover:bg-canvas";

  if (def.type === "multi") {
    return (
      <fieldset className="m-0 max-h-80 overflow-y-auto border-0 p-1.5">
        <legend className="sr-only">{def.label}</legend>
        {def.options.map((o) => (
          <label key={o.value} className={row}>
            <input
              type="checkbox"
              checked={values.includes(o.value)}
              onChange={(e) => onChange(e.target.checked ? [...values, o.value] : values.filter((v) => v !== o.value))}
              className="size-4 accent-navy"
            />
            {o.label}
          </label>
        ))}
      </fieldset>
    );
  }

  const options = def.type === "single" ? def.options : def.presets;
  return (
    <div className="p-1.5">
      <fieldset className="m-0 border-0 p-0">
        <legend className="sr-only">{def.label}</legend>
        {[{ value: "", label: def.allLabel ?? "All" }, ...options].map((o) => (
          <label key={o.value} className={row}>
            <input
              type="radio"
              name={name}
              checked={o.value === "" ? values.length === 0 : values.length === 1 && values[0] === o.value}
              onChange={() => {
                onChange(o.value ? [o.value] : []);
                close();
              }}
              className="size-4 accent-navy"
            />
            {o.label}
          </label>
        ))}
      </fieldset>
      {def.type === "date" && (
        <form
          className="mt-1.5 flex flex-col gap-2 border-t border-line p-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!from || !to) return;
            onChange(from <= to ? [from, to] : [to, from]);
            close();
          }}
        >
          <p className="m-0 text-[13px] font-semibold">Custom dates</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-[12px] font-semibold text-muted">
              From
              <input type="date" required value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 rounded-lg border border-field px-2 text-[13px] text-ink" />
            </label>
            <label className="flex flex-col gap-1 text-[12px] font-semibold text-muted">
              To
              <input type="date" required value={to} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-lg border border-field px-2 text-[13px] text-ink" />
            </label>
          </div>
          <button type="submit" className="h-9 rounded-lg bg-navy text-[13px] font-bold text-white hover:bg-navy-dark">
            Apply dates
          </button>
        </form>
      )}
    </div>
  );
}

/** The search field used at the start of a filter bar. */
export function SearchField({ label, placeholder, value, onChange }: { label: string; placeholder: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="flex h-[38px] min-w-0 flex-[1_1_240px] items-center gap-2 rounded-[10px] border border-line bg-canvas px-3 text-[14px] text-muted focus-within:border-navy focus-within:ring-2 focus-within:ring-navy/25">
      <Icon name="search" size={16} strokeWidth={2} />
      <span className="sr-only">{label}</span>
      <input
        type="search"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 flex-1 border-0 bg-transparent text-[14px] text-ink outline-none placeholder:text-muted"
      />
    </label>
  );
}
