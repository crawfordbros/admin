import { useId, type ComponentProps, type ReactNode } from "react";
import { cx } from "../styles";
import { Icon } from "./icons";

// Form pieces for the Steward screens (docs/design/steward/Steward-ProfileSetup, Steward-SetupSecurity):
// 56 px fields, a switch, the three-step bar and messages.

export function Field({
  label,
  error,
  hint,
  className,
  ...props
}: { label: string; error?: string; hint?: ReactNode } & ComponentProps<"input">) {
  const id = useId();
  const described = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cx("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={described}
        className="h-14 min-w-0 rounded-xl border border-st-border bg-st-raised px-3.5 text-base text-st-text placeholder:text-st-text-3 focus:border-2 focus:border-st-text focus:px-[13px] focus:outline-none aria-[invalid=true]:border-st-bad"
        {...props}
      />
      {hint && !error && (
        <p id={`${id}-hint`} className="m-0 text-[12.5px] text-st-text-3">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="m-0 text-[13px] font-semibold text-st-bad">
          {error}
        </p>
      )}
    </div>
  );
}

/** An on/off setting with its explanation; the whole row toggles it. */
export function SwitchRow({ label, detail, checked, onChange }: { label: string; detail?: string; checked: boolean; onChange: (on: boolean) => void }) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-st-surface p-3.5">
      <span className="text-sm font-semibold">
        <span id={`${id}-label`}>{label}</span>
        {detail && <span className="block text-[12.5px] font-normal text-st-text-3">{detail}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        onClick={() => onChange(!checked)}
        className={cx("relative h-[30px] w-[50px] flex-none rounded-full transition-colors", checked ? "bg-st-ok" : "bg-st-track")}
      >
        <span className={cx("absolute top-[3px] size-6 rounded-full bg-white shadow transition-[left]", checked ? "left-[23px]" : "left-[3px]")} />
      </button>
    </div>
  );
}

/** "Step 2 of 3" and its three bars. */
export function StepBar({ step, label }: { step: 1 | 2 | 3; label: string }) {
  return (
    <div>
      <p className="m-0 text-right text-[13px] font-bold text-st-accent">{label}</p>
      <div aria-hidden="true" className="mt-3.5 flex gap-1.5">
        {[1, 2, 3].map((n) => (
          <span key={n} className={cx("h-[5px] flex-1 rounded-full", n <= step ? "bg-st-accent" : "bg-st-track")} />
        ))}
      </div>
    </div>
  );
}

export function Notice({ tone = "bad", children }: { tone?: "bad" | "ok" | "warn"; children: ReactNode }) {
  const tones = { bad: "bg-st-bad-bg text-st-bad", ok: "bg-st-ok-bg text-st-ok", warn: "bg-st-warn-bg text-st-warn" };
  return (
    <p role={tone === "bad" ? "alert" : "status"} className={cx("m-0 rounded-xl px-3.5 py-2.5 text-[13.5px] font-semibold", tones[tone])}>
      {children}
    </p>
  );
}

/** A checkmark line, for photo rules and "Profile complete". */
export function CheckLine({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cx("flex items-center gap-2", className)}>
      <Icon name="check" size={14} strokeWidth={2.6} className="flex-none" />
      {children}
    </span>
  );
}
