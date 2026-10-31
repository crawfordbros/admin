import type { ComponentProps, ReactNode } from "react";
import { Link, type LinkProps } from "react-router-dom";
import { cx } from "../styles";
import { initials } from "../../lib/steward/names";
import { useCrewPhoto } from "../../lib/steward/crew";
import { AvatarSilhouette, Icon, type IconName } from "./icons";

// Building blocks for the Steward screens (docs/design/steward). Primary actions are at least 56 px tall
// for gloved, one-handed use (STEWARD_APP_SPEC section 8).

const cta =
  "flex min-h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-st-cta px-5 text-[17px] font-bold text-st-on-cta no-underline shadow-st hover:text-st-on-cta disabled:cursor-not-allowed disabled:bg-st-track disabled:text-st-text-3 disabled:shadow-none";
const outline =
  "flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border border-st-border bg-transparent px-5 text-base font-bold text-st-text no-underline hover:bg-st-raised hover:text-st-text disabled:cursor-not-allowed disabled:opacity-60";

/** The screen's main action, pinned above the tab bar on phones. */
export function CtaLink({ icon, className, children, ...props }: LinkProps & { icon?: IconName }) {
  return (
    <Link className={cx(cta, className)} {...props}>
      {icon && <Icon name={icon} size={22} strokeWidth={2} />}
      {children}
    </Link>
  );
}

export function CtaButton({ icon, className, children, type = "button", ...props }: ComponentProps<"button"> & { icon?: IconName }) {
  return (
    <button type={type} className={cx(cta, className)} {...props}>
      {icon && <Icon name={icon} size={22} strokeWidth={2} />}
      {children}
    </button>
  );
}

export function OutlineButton({ className, type = "button", ...props }: ComponentProps<"button">) {
  return <button type={type} className={cx(outline, className)} {...props} />;
}

/** A content block: the navy card at night, a white card by day. */
export function Panel({ className, children, ...props }: ComponentProps<"section">) {
  return (
    <section className={cx("rounded-2xl bg-st-surface p-4", className)} {...props}>
      {children}
    </section>
  );
}

/**
 * A screen's title. The small gold line above it names the property, the date or the Steward, as in the
 * designs; `back` adds the square back (or close) button on detail screens.
 */
export function ScreenHeader({
  eyebrow,
  title,
  intro,
  back,
  aside,
  leading,
}: {
  eyebrow?: string;
  title: string;
  intro?: string;
  back?: { to: string; label: string; icon?: "back" | "close" };
  aside?: ReactNode;
  leading?: ReactNode;
}) {
  return (
    <header className="flex items-center gap-3 pt-[18px] pb-2">
      {back && (
        <Link
          to={back.to}
          aria-label={back.label}
          className="flex size-11 flex-none items-center justify-center rounded-xl bg-st-surface text-st-text hover:text-st-text"
        >
          <Icon name={back.icon ?? "back"} size={20} strokeWidth={2.2} />
        </Link>
      )}
      {leading}
      <div className="min-w-0 flex-1">
        {eyebrow && <p className="m-0 truncate text-xs font-bold tracking-[0.08em] text-st-accent uppercase">{eyebrow}</p>}
        <h1 className="mt-0.5 mb-0 text-[23px] leading-tight font-bold sm:text-[26px]">{title}</h1>
        {intro && <p className="mt-1 mb-0 max-w-[60ch] text-[13.5px] leading-normal text-st-text-2">{intro}</p>}
      </div>
      {aside}
    </header>
  );
}

/** What an empty screen says, and what to do about it. */
export function EmptyState({ icon, title, body, note, children }: { icon: IconName; title: string; body: string; note?: string; children?: ReactNode }) {
  return (
    <Panel className="flex items-start gap-3.5 p-5">
      <span className="flex size-12 flex-none items-center justify-center rounded-[14px] bg-st-raised text-st-accent">
        <Icon name={icon} size={24} strokeWidth={2} />
      </span>
      <div className="min-w-0">
        <h2 className="m-0 text-[17px] leading-snug font-bold">{title}</h2>
        {note && <p className="mt-1 mb-0 w-fit rounded-full bg-st-info-bg px-2.5 py-0.5 text-xs font-bold text-st-info">{note}</p>}
        <p className="mt-1 mb-0 max-w-[52ch] text-[14.5px] leading-relaxed text-st-text-2">{body}</p>
        {children}
      </div>
    </Panel>
  );
}

/** A choice between a few options (language, appearance): one row of pill buttons. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-xl bg-st-raised p-1">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cx(
              "min-h-11 flex-1 rounded-[9px] px-2 text-[14px] transition-colors",
              on ? "bg-st-cta font-bold text-st-on-cta" : "font-semibold text-st-text-2 hover:text-st-text",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Avatar({ name, photoUrl, size = 42, ring = true }: { name: string; photoUrl?: string | null; size?: number; ring?: boolean }) {
  const src = useCrewPhoto(photoUrl ?? null);
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.34) }}
      className={cx(
        "flex flex-none items-center justify-center overflow-hidden rounded-full bg-st-avatar font-bold text-st-text",
        ring && (size >= 72 ? "border-[3px] border-st-accent" : "border-2 border-st-accent"),
      )}
    >
      {src ? <img src={src} alt="" className="size-full object-cover" /> : name ? initials(name) : <AvatarSilhouette size={Math.round(size * 0.65)} />}
    </span>
  );
}

/**
 * The screen's main action at the bottom, kept in reach of the thumb: it sticks just above the tab bar
 * on phones, and to the bottom of the window on tablets.
 */
export function BottomAction({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-(--st-tabbar) z-10 mt-auto -mx-5 flex flex-col gap-2 bg-st-bg px-5 pt-3 pb-3 md:-mx-8 md:px-8 md:pb-4">
      {children}
    </div>
  );
}
