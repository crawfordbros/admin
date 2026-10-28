import { useEffect, useId, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { TextField } from "../../components/ui";
import { cx } from "../../components/styles";

/** Each step's heading. Later steps take focus so screen readers announce the change. */
export function StepHeading({ title, focus = true, children }: { title: string; focus?: boolean; children?: ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focus) ref.current?.focus();
  }, [focus]);
  return (
    <div className="mb-6 text-center">
      <h1 ref={ref} tabIndex={-1} className="m-0 text-[1.75rem] leading-tight font-bold text-navy focus:outline-none">
        {title}
      </h1>
      {children && <p className="mt-2 mb-0 leading-relaxed text-muted">{children}</p>}
    </div>
  );
}

export function CodeField({ label, autoComplete, ...props }: Omit<ComponentProps<typeof TextField>, "label"> & { label?: string }) {
  return (
    <TextField
      label={label ?? "Verification code"}
      autoComplete={autoComplete ?? "one-time-code"}
      inputMode="numeric"
      pattern="[0-9]{6}"
      maxLength={6}
      required
      {...props}
    />
  );
}

export function PasswordField(props: ComponentProps<typeof TextField>) {
  const [shown, setShown] = useState(false);
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <TextField type={shown ? "text" : "password"} required {...props} />
      <label htmlFor={id} className="inline-flex w-fit cursor-pointer items-center gap-2 text-sm text-muted">
        <input id={id} type="checkbox" checked={shown} onChange={(e) => setShown(e.target.checked)} className="size-4 accent-navy" />
        Show password
      </label>
    </div>
  );
}

/** An action that reads as a link: switching method, resending a code, going back. */
export function TextButton({ className, ...props }: ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cx(
        "cursor-pointer py-1.5 text-left text-[15px] font-semibold text-navy underline underline-offset-3 hover:text-navy-dark disabled:cursor-not-allowed disabled:text-muted disabled:no-underline",
        className,
      )}
      {...props}
    />
  );
}

/** The email being signed in, with a way to start over. */
export function SignedInAs({ email, onChange }: { email: string; onChange: () => void }) {
  return (
    <p className="-mt-3 mb-5 flex flex-wrap items-baseline gap-x-3 text-[15px] text-muted">
      <span className="min-w-0 font-semibold break-all text-ink">{email}</span>
      <TextButton onClick={onChange} className="text-sm">
        Use a different email
      </TextButton>
    </p>
  );
}
