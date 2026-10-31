/** "M2 27 L13.4 20 ..." for values scaled into a w×h box with a 2 px inset. */
export function sparkPath(values: number[], w: number, h: number) {
  if (values.length === 0) return "";
  const max = Math.max(...values);
  const min = Math.min(...values);
  const step = values.length > 1 ? (w - 4) / (values.length - 1) : 0;
  return values
    .map((v, i) => `${i ? "L" : "M"}${(2 + i * step).toFixed(1)} ${(h - 3 - ((v - min) / (max - min || 1)) * (h - 6)).toFixed(1)}`)
    .join(" ");
}

/** A round number at or above `max` on a `step` grid, so the top gridline is labeled. */
export function niceMax(max: number, step: number) {
  return Math.max(step, Math.ceil(max / step) * step);
}

/** Picks a whole-number grid step that gives about four lines (counts never need halves). */
export function niceStep(max: number) {
  const raw = Math.max(1, max / 4);
  const pow = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? pow * 10;
}
