import { useEffect, useId, useRef, useState, type ComponentProps, type MouseEvent, type ReactNode } from "react";
import { Link, type LinkProps } from "react-router-dom";
import { buttonClass, cx, type Variant } from "./styles";

// Same building blocks and styles as cbes-web (src/components/fields.tsx).

/**
 * Every button guards against double clicks: the extra clicks of a double-click (the browser
 * counts them in `detail`) are ignored, so a submit button can't submit twice; and when `onClick`
 * returns a promise the button stays disabled until it settles. useApi also shares identical
 * writes, as the last line of defence.
 */
export function Button({ variant, className, type = "button", onClick, disabled, ...props }: Omit<ComponentProps<"button">, "onClick"> & {
  variant?: Variant;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => unknown;
}) {
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const click = (e: MouseEvent<HTMLButtonElement>) => {
    if (busy || e.detail > 1) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    const result = onClick?.(e);
    if (result && typeof (result as Promise<unknown>).then === "function") {
      setBusy(true);
      void (result as Promise<unknown>).catch(() => {}).finally(() => mounted.current && setBusy(false));
    }
  };
  return <button type={type} className={buttonClass(variant, className)} disabled={disabled || busy} aria-busy={busy || undefined} onClick={click} {...props} />;
}

export function ButtonLink({ variant, className, ...props }: LinkProps & { variant?: Variant }) {
  return <Link className={buttonClass(variant, className)} {...props} />;
}

const control =
  "min-h-11 w-full rounded-lg border border-field bg-white px-3 text-base text-ink focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/25 aria-[invalid=true]:border-danger";

type FieldProps = { label: string; error?: string; hint?: ReactNode; optional?: boolean; className?: string };

function Field({ id, label, error, hint, optional, className, children }: FieldProps & { id: string; children: ReactNode }) {
  return (
    <div className={cx("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
        {optional && <span className="font-normal text-muted"> (optional)</span>}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="m-0 text-[13px] text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="m-0 text-[13px] font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

const describedBy = (id: string, error?: string, hint?: ReactNode) => (error ? `${id}-error` : hint ? `${id}-hint` : undefined);

export function TextField({ label, error, hint, optional, className, ...props }: FieldProps & ComponentProps<"input">) {
  const id = useId();
  return (
    <Field id={id} label={label} error={error} hint={hint} optional={optional} className={className}>
      <input id={id} className={control} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, error, hint)} {...props} />
    </Field>
  );
}

export function SelectField({
  label,
  error,
  hint,
  optional,
  className,
  children,
  ...props
}: FieldProps & ComponentProps<"select">) {
  const id = useId();
  return (
    <Field id={id} label={label} error={error} hint={hint} optional={optional} className={className}>
      <select id={id} className={control} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, error, hint)} {...props}>
        {children}
      </select>
    </Field>
  );
}

export function Alert({ tone = "danger", children }: { tone?: "danger" | "success"; children: ReactNode }) {
  return (
    <p
      role={tone === "danger" ? "alert" : "status"}
      className={cx(
        "m-0 rounded-lg px-4 py-3 text-[15px] font-semibold",
        tone === "danger" ? "bg-danger/10 text-danger" : "bg-success/10 text-success",
      )}
    >
      {children}
    </p>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <p role="status" className="py-12 text-center text-muted">
      {label}
    </p>
  );
}

export function Card({ title, action, children, className }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-xl border border-line bg-white p-5 sm:p-6", className)}>
      {(title || action) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {title && <h2 className="m-0 text-xl text-ink">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="rounded-xl border border-line bg-white p-4">
      <p className="m-0 font-heading text-3xl font-bold text-navy">{value}</p>
      <p className="mt-1 mb-0 text-[13px] text-muted">{label}</p>
    </div>
  );
}
