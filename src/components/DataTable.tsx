import type { KeyboardEvent, ReactNode } from "react";
import { Delayed, Skeleton } from "./display";
import { Icon } from "./icons";
import { cx } from "./styles";

export type Column<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Shown to screen readers when the header is visually empty (such as an actions column). */
  srHeader?: string;
  sortable?: boolean;
  className?: string;
};

export type Sort = { key: string; dir: "asc" | "desc" };

/**
 * The admin list table: sticky header, horizontal scroll inside its card, optional checkbox
 * column, and rows that open with Enter when `onRowClick` is set. Sorting and paging happen on
 * the server; the table only reports what was clicked.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  label,
  selectable,
  selected,
  onSelect,
  onRowClick,
  sort,
  onSort,
  empty,
  loading,
  footer,
  minWidth = 860,
  rowLabel,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  label: string;
  selectable?: boolean;
  selected?: ReadonlySet<string>;
  onSelect?: (next: Set<string>) => void;
  onRowClick?: (row: T) => void;
  sort?: Sort;
  onSort?: (sort: Sort) => void;
  empty: ReactNode;
  loading?: boolean;
  footer?: ReactNode;
  minWidth?: number;
  /** Names each row's checkbox for screen readers ("Select V-2041"); "Select row" without it. */
  rowLabel?: (row: T) => string;
}) {
  const keys = rows.map(rowKey);
  const chosen = selected ?? new Set<string>();
  const allOn = keys.length > 0 && keys.every((k) => chosen.has(k));
  const someOn = !allOn && keys.some((k) => chosen.has(k));

  const toggle = (key: string) => {
    const next = new Set(chosen);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onSelect?.(next);
  };
  const toggleAll = () => onSelect?.(allOn ? new Set([...chosen].filter((k) => !keys.includes(k))) : new Set([...chosen, ...keys]));

  const onRowKey = (e: KeyboardEvent, row: T) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter") onRowClick?.(row);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const tr = e.currentTarget as HTMLElement;
      ((e.key === "ArrowDown" ? tr.nextElementSibling : tr.previousElementSibling) as HTMLElement | null)?.focus();
    }
  };

  const colCount = columns.length + (selectable ? 1 : 0);

  return (
    <div>
      <div className="relative max-h-[70vh] overflow-auto">
        {/* An empty table only holds its message, so it fits the screen instead of scrolling sideways. */}
        <table aria-label={label} aria-busy={loading || undefined} className="w-full border-collapse text-[14px]" style={{ minWidth: !loading && rows.length === 0 ? undefined : minWidth }}>
          <thead className="sticky top-0 z-10 bg-subtle">
            <tr className="text-left text-[12px] text-muted">
              {selectable && (
                <th scope="col" className="w-7 py-2.5 pr-2 pl-4">
                  <input
                    type="checkbox"
                    aria-label="Select all on this page"
                    checked={allOn}
                    ref={(el) => {
                      if (el) el.indeterminate = someOn;
                    }}
                    onChange={toggleAll}
                    className="size-4 accent-navy"
                  />
                </th>
              )}
              {columns.map((c, i) => {
                const dir = sort?.key === c.key ? sort.dir : null;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : undefined}
                    className={cx("px-2 py-2.5 font-semibold", i === 0 && !selectable && "pl-4", i === columns.length - 1 && "pr-4", c.className)}
                  >
                    {c.srHeader && <span className="sr-only">{c.srHeader}</span>}
                    {c.sortable && onSort ? (
                      <button
                        type="button"
                        onClick={() => onSort({ key: c.key, dir: dir === "asc" ? "desc" : "asc" })}
                        className="inline-flex items-center gap-1 font-semibold text-muted hover:text-ink"
                      >
                        {c.header}
                        <Icon name="chevron-down" size={13} strokeWidth={2.4} className={cx("flex-none transition-transform", dir === "asc" && "rotate-180", !dir && "opacity-40")} />
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 6 }, (_, i) => (
                <tr key={i} className="border-t border-row-line">
                  <td colSpan={colCount} className="px-4 py-3">
                    <Delayed>
                      <Skeleton className="h-9 w-full" />
                    </Delayed>
                  </td>
                </tr>
              ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={colCount}>{empty}</td>
              </tr>
            )}
            {!loading &&
              rows.map((row) => {
                const key = rowKey(row);
                const on = chosen.has(key);
                return (
                  <tr
                    key={key}
                    tabIndex={onRowClick ? 0 : undefined}
                    onClick={onRowClick ? (e) => !(e.target as HTMLElement).closest("a,button,input,label") && onRowClick(row) : undefined}
                    onKeyDown={onRowClick ? (e) => onRowKey(e, row) : undefined}
                    aria-selected={selectable ? on : undefined}
                    className={cx(
                      "border-t border-row-line align-middle",
                      onRowClick && "cursor-pointer hover:bg-subtle focus-visible:bg-subtle",
                      on && "bg-tint-2/60",
                    )}
                  >
                    {selectable && (
                      <td className="py-3 pr-2 pl-4">
                        <input type="checkbox" aria-label={rowLabel ? rowLabel(row) : "Select row"} checked={on} onChange={() => toggle(key)} className="size-4 accent-navy" />
                      </td>
                    )}
                    {columns.map((c, i) => (
                      <td key={c.key} className={cx("px-2 py-2.5", i === 0 && !selectable && "pl-4", i === columns.length - 1 && "pr-4", c.className)}>
                        {c.cell(row)}
                      </td>
                    ))}
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
      {footer}
    </div>
  );
}

const pagerButton =
  "inline-flex h-[34px] items-center rounded-lg border border-field bg-white px-3 text-[13px] font-semibold text-ink hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-50";

export function Pagination({ page, pageSize, total, onChange, noun }: { page: number; pageSize: number; total: number; onChange: (page: number) => void; noun?: string }) {
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  const fmt = new Intl.NumberFormat("en-US");
  return (
    <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-[13px] text-muted">
      <span aria-live="polite">
        Showing {fmt.format(first)}–{fmt.format(last)} of {fmt.format(total)}
        {noun ? ` ${noun}` : ""}
      </span>
      <span className="flex gap-1.5">
        <button type="button" className={pagerButton} disabled={page <= 1} onClick={() => onChange(page - 1)}>
          Previous
        </button>
        <button type="button" className={pagerButton} disabled={last >= total} onClick={() => onChange(page + 1)}>
          Next
        </button>
      </span>
    </nav>
  );
}
