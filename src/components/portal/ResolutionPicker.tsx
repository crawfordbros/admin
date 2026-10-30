import type { Resolution } from "../../lib/api";
import { RESOLUTION_LABELS } from "../../lib/format";
import { cx } from "../styles";

const OPTIONS: Resolution[] = ["courtesy_notice", "spoke_with_resident", "lease_violation", "other"];

/** "How did you handle it?" (REP_PORTAL_SPEC 4.4): radio cards for a resolved violation. Other needs a note. */
export function ResolutionPicker({ value, onChange, name = "resolution", error }: { value: Resolution | null; onChange: (value: Resolution) => void; name?: string; error?: string }) {
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0" aria-describedby={error ? `${name}-error` : undefined}>
      <legend className="mb-2 p-0 text-[13px] font-semibold text-muted">How did you handle it?</legend>
      {OPTIONS.map((r) => {
        const on = value === r;
        return (
          <label
            key={r}
            className={cx(
              "flex cursor-pointer items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-[13.5px] font-semibold focus-within:ring-2 focus-within:ring-gold",
              on ? "border-2 border-success bg-success-bg" : "border border-line hover:border-field",
            )}
          >
            <input type="radio" name={name} value={r} checked={on} onChange={() => onChange(r)} className="accent-success" />
            {r === "other" ? "Other (add a note)" : RESOLUTION_LABELS[r]}
          </label>
        );
      })}
      {error && (
        <p id={`${name}-error`} className="m-0 text-[13px] font-semibold text-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}
