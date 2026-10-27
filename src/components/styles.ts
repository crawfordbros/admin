// Same button styles as cbes-web (src/components/styles.ts).

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export type Variant = "primary" | "outline" | "danger";

const variants: Record<Variant, string> = {
  primary: "bg-navy text-white hover:bg-navy-dark hover:text-white",
  outline: "border-2 border-navy text-navy hover:bg-tint",
  danger: "border-2 border-danger text-danger hover:bg-danger/5",
};

export const buttonClass = (variant: Variant = "primary", className?: string) =>
  cx(
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-base font-bold no-underline transition-colors disabled:cursor-not-allowed disabled:opacity-60",
    variants[variant],
    className,
  );
