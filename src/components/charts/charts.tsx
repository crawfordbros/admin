import { useEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "../styles";
import { niceMax, niceStep, sparkPath } from "./scale";

// Small hand-built SVG charts (ADMIN_PORTAL_SPEC section 4.6). Each one scales to its container,
// states its main number in an aria-label and carries a hidden table for screen readers.

export type ChartTone = "navy" | "navy-light" | "gold" | "gold-light" | "success" | "danger" | "warning" | "muted";

const FILL: Record<ChartTone, string> = {
  navy: "fill-navy",
  "navy-light": "fill-navy-light",
  gold: "fill-gold",
  "gold-light": "fill-gold-light",
  success: "fill-success",
  danger: "fill-danger",
  warning: "fill-warning",
  muted: "fill-field",
};
const STROKE: Record<ChartTone, string> = {
  navy: "stroke-navy",
  "navy-light": "stroke-navy-light",
  gold: "stroke-gold",
  "gold-light": "stroke-gold-light",
  success: "stroke-success",
  danger: "stroke-danger",
  warning: "stroke-warning",
  muted: "stroke-field",
};
const BG: Record<ChartTone, string> = {
  navy: "bg-navy",
  "navy-light": "bg-navy-light",
  gold: "bg-gold",
  "gold-light": "bg-gold-light",
  success: "bg-success",
  danger: "bg-danger",
  warning: "bg-warning",
  muted: "bg-field",
};

const num = new Intl.NumberFormat("en-US");

/** The same numbers as a table, for screen readers. */
export function ChartTable({ caption, head, rows }: { caption: string; head: string[]; rows: ReactNode[][] }) {
  // The wrapper is what's visually hidden: a table won't shrink to sr-only's 1 px width.
  return (
    <div className="sr-only">
    <table>
      <caption>{caption}</caption>
      <thead>
        <tr>
          {head.map((h) => (
            <th key={h} scope="col">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => (j === 0 ? <th key={j} scope="row">{c}</th> : <td key={j}>{c}</td>))}
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}

export function Legend({ items }: { items: { label: string; tone: ChartTone }[] }) {
  return (
    <ul className="m-0 flex list-none flex-wrap gap-3.5 p-0 text-[13px] text-muted">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span aria-hidden="true" className={cx("size-2.5 rounded-[3px]", BG[i.tone])} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

/** A trend line with no axes, for tiles and table rows. Decorative: the value sits beside it. */
export function Sparkline({ values, tone = "navy", width = 84, height = 30 }: { values: number[]; tone?: ChartTone; width?: number; height?: number }) {
  if (values.length < 2) return null;
  return (
    <svg aria-hidden="true" width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="flex-none">
      <path d={sparkPath(values, width, height)} fill="none" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={STROKE[tone]} />
    </svg>
  );
}

/**
 * Draws the chart at its container's width so labels stay 11 px whether the card is narrow or
 * full width (scaling one fixed viewBox would blow the text up on wide screens).
 */
function useWidth(fallback = 640) {
  const ref = useRef<HTMLElement>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

const H = 220;
const TOP = 14;
const BOTTOM = 28;
const LEFT = 36;
const PLOT = H - TOP - BOTTOM;

function YGrid({ max, step, W }: { max: number; step: number; W: number }) {
  const lines = [];
  for (let v = 0; v <= max; v += step) {
    const y = TOP + PLOT - (v / max) * PLOT;
    lines.push(
      <g key={v}>
        <line x1={LEFT} x2={W - 8} y1={y} y2={y} className="stroke-row-line" />
        <text x={LEFT - 8} y={y + 4} textAnchor="end" fontSize={11} className="fill-muted">
          {num.format(v)}
        </text>
      </g>,
    );
  }
  return <>{lines}</>;
}

export type Series = { key: string; label: string; tone: ChartTone };

/** Side-by-side bars per period, such as violations and resident reports per week. */
export function GroupedBars<K extends string>({
  data,
  series,
  label,
  step,
  highlight,
}: {
  data: ({ label: string } & Record<K, number>)[];
  series: (Series & { key: K })[];
  label: string;
  step?: number;
  /** A period's label to set in bold, such as the current week. */
  highlight?: string;
}) {
  const [ref, W] = useWidth();
  const top = Math.max(0, ...data.flatMap((d) => series.map((s) => d[s.key])));
  const gridStep = step ?? niceStep(top);
  const max = niceMax(top, gridStep);
  const slot = (W - LEFT - 8) / Math.max(1, data.length);
  const bar = Math.min(26, (slot * 0.7) / series.length);

  return (
    <figure ref={ref} className="m-0">
      <svg role="img" aria-label={label} width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block max-w-full">
        <YGrid max={max} step={gridStep} W={W} />
        {data.map((d, i) => {
          const x0 = LEFT + i * slot + (slot - bar * series.length - 4 * (series.length - 1)) / 2;
          return (
            <g key={d.label}>
              {series.map((s, j) => {
                const h = (d[s.key] / max) * PLOT;
                return <rect key={s.key} x={x0 + j * (bar + 4)} y={TOP + PLOT - h} width={bar} height={h} rx={Math.min(5, bar / 4)} className={FILL[s.tone]} />;
              })}
              <text x={LEFT + i * slot + slot / 2} y={H - 8} textAnchor="middle" fontSize={11} fontWeight={d.label === highlight ? 700 : undefined} className={d.label === highlight ? "fill-ink" : "fill-muted"}>
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
      <ChartTable caption={label} head={["Period", ...series.map((s) => s.label)]} rows={data.map((d) => [d.label, ...series.map((s) => num.format(d[s.key]))])} />
    </figure>
  );
}

/** One bar per period split into parts, such as reports resolved / in progress / new. */
export function StackedBars<K extends string>({
  data,
  series,
  label,
  step,
}: {
  data: ({ label: string } & Record<K, number>)[];
  /** Bottom to top. */
  series: (Series & { key: K })[];
  label: string;
  step?: number;
}) {
  const [ref, W] = useWidth();
  const totals = data.map((d) => series.reduce((sum, s) => sum + d[s.key], 0));
  const gridStep = step ?? niceStep(Math.max(0, ...totals));
  const max = niceMax(Math.max(0, ...totals), gridStep);
  const slot = (W - LEFT - 8) / Math.max(1, data.length);
  const bar = Math.min(30, slot * 0.62);

  return (
    <figure ref={ref} className="m-0">
      <svg role="img" aria-label={label} width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block max-w-full">
        <YGrid max={max} step={gridStep} W={W} />
        {data.map((d, i) => {
          const x = LEFT + i * slot + (slot - bar) / 2;
          let y = TOP + PLOT;
          return (
            <g key={d.label}>
              {series.map((s) => {
                const h = (d[s.key] / max) * PLOT;
                y -= h;
                return h > 0 ? <rect key={s.key} x={x} y={y} width={bar} height={h} className={FILL[s.tone]} /> : null;
              })}
              <text x={x + bar / 2} y={H - 8} textAnchor="middle" fontSize={11} className="fill-muted">
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
      <ChartTable
        caption={label}
        head={["Period", ...series.map((s) => s.label), "Total"]}
        rows={data.map((d, i) => [d.label, ...series.map((s) => num.format(d[s.key])), num.format(totals[i])])}
      />
    </figure>
  );
}

/** A ring showing one share, with the percent in the middle. */
export function Donut({ percent, label, sub, tone = "success", size = 140 }: { percent: number; label: string; sub?: string; tone?: ChartTone; size?: number }) {
  const pct = Math.max(0, Math.min(100, percent));
  const r = 42;
  const c = 2 * Math.PI * r;
  return (
    <svg role="img" aria-label={label} width={size} height={size} viewBox="0 0 100 100" className="flex-none">
      <circle cx={50} cy={50} r={r} fill="none" strokeWidth={12} className="stroke-tint-2" />
      <circle
        cx={50}
        cy={50}
        r={r}
        fill="none"
        strokeWidth={12}
        strokeLinecap="round"
        strokeDasharray={`${(pct / 100) * c} ${c}`}
        transform="rotate(-90 50 50)"
        className={STROKE[tone]}
      />
      <text x={50} y={sub ? 50 : 56} textAnchor="middle" fontSize={20} fontWeight={700} className="fill-navy-ink font-heading">
        {Math.round(pct)}%
      </text>
      {sub && (
        <text x={50} y={65} textAnchor="middle" fontSize={9} className="fill-muted">
          {sub}
        </text>
      )}
    </svg>
  );
}

export type HBar = { key: string; label: ReactNode; value: number; display?: ReactNode; secondary?: number };

/** Ranked bars with labels, such as issue types or violations by building. */
export function HBarList({
  items,
  label,
  tone = "navy",
  secondaryTone = "gold-light",
  max,
}: {
  items: HBar[];
  label: string;
  tone?: ChartTone;
  /** Colors the `secondary` part of each bar, drawn after the main part. */
  secondaryTone?: ChartTone;
  max?: number;
}) {
  const top = max ?? Math.max(1, ...items.map((i) => i.value + (i.secondary ?? 0)));
  return (
    <ul aria-label={label} className="m-0 flex list-none flex-col gap-3 p-0">
      {items.map((i) => (
        <li key={i.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 text-[13.5px]">
          <span className="min-w-0 truncate font-semibold">{i.label}</span>
          <span className="font-bold text-navy-ink tabular-nums">{i.display ?? num.format(i.value + (i.secondary ?? 0))}</span>
          <span aria-hidden="true" className="col-span-2 flex h-2.5 overflow-hidden rounded-md bg-tint-2">
            <span className={cx("h-full", BG[tone])} style={{ width: `${(i.value / top) * 100}%` }} />
            {i.secondary ? <span className={cx("h-full", BG[secondaryTone])} style={{ width: `${(i.secondary / top) * 100}%` }} /> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** A row of small squares, such as the five service nights of a week. */
export function DotStrip({ items, label, size = 14 }: { items: { label: string; tone: ChartTone }[]; label: string; size?: number }) {
  return (
    <span role="img" aria-label={label} className="inline-flex gap-[3px]">
      {items.map((i, n) => (
        <span key={n} title={i.label} className={cx("rounded-[3px]", BG[i.tone])} style={{ width: size, height: size }} />
      ))}
    </span>
  );
}
