import { type PropertyReference } from "../../lib/propertyAddress";
import { PropertyAddress } from "../PropertyAddress";
import { Icon } from "../icons";
import { cx } from "../styles";

/** Pick which of the organization's properties someone can see (REP_PORTAL_SPEC 4.4). */
export function PropertyChips({
  properties,
  value,
  onChange,
  label = "Properties they can see",
  error,
}: {
  properties: PropertyReference[];
  value: string[];
  onChange: (ids: string[]) => void;
  label?: string;
  error?: string;
}) {
  const errorId = `${label.replace(/\W+/g, "-").toLowerCase()}-error`;
  return (
    <fieldset className="m-0 min-w-0 border-0 p-0" aria-describedby={error ? errorId : undefined}>
      <legend className="mb-2 p-0 text-[13.5px] font-semibold text-ink">
        {label} <span className="font-normal text-muted">· {value.length} selected</span>
      </legend>
      <div className="flex flex-wrap gap-2">
        {properties.map((p) => {
          const on = value.includes(p.id);
          return (
            <label
              key={p.id}
              className={cx(
                "inline-flex min-h-9 py-2 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-bold focus-within:ring-2 focus-within:ring-gold",
                on ? "border-navy bg-navy text-white" : "border-field bg-white text-ink hover:border-navy",
              )}
            >
              <input type="checkbox" className="sr-only" checked={on} onChange={() => onChange(on ? value.filter((id) => id !== p.id) : [...value, p.id])} />
              {on && <Icon name="check" size={14} strokeWidth={2.6} />}
              <span>{p.name}<PropertyAddress property={p} className={on ? "text-white/80" : undefined} /></span>
            </label>
          );
        })}
      </div>
      {error && (
        <p id={errorId} className="mt-1.5 mb-0 text-[13px] font-semibold text-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}
