import { Icon } from "../icons";
import { MenuList, Popover } from "../Popover";
import { cx } from "../styles";
import { useAccountIdentity, useSignOut } from "./account";

/** A gold initial on navy: the account's mark in the menu and on Account settings. */
export function Monogram({ initial, size = 38, ring }: { initial: string; size?: number; ring?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cx("flex flex-none items-center justify-center rounded-full bg-navy-ink font-heading font-bold text-gold-light", ring && "ring-2 ring-gold-light/70")}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.46) }}
    >
      {initial}
    </span>
  );
}

/** Replaces Clerk's UserButton: who's signed in, a way to Account settings, and Sign out. */
export function AccountMenu({ settingsPath, tone = "light" }: { settingsPath: string; tone?: "light" | "navy" }) {
  const { name, email, roleLabel, initial } = useAccountIdentity();
  const signOut = useSignOut();
  const light = tone === "light";

  return (
    <Popover
      label="Account"
      haspopup="menu"
      align="end"
      width={288}
      trigger={(props) => (
        <button
          type="button"
          {...props}
          aria-label={`Account: ${name}`}
          className={cx(
            "flex flex-none items-center gap-2.5 rounded-full p-0.5 text-left md:rounded-[12px] md:py-1 md:pr-2 md:pl-1",
            light ? "text-ink hover:bg-canvas aria-expanded:bg-canvas" : "text-white hover:bg-white/10 aria-expanded:bg-white/10",
          )}
        >
          <Monogram initial={initial} ring={!light} />
          {light && (
            <span className="hidden min-w-0 flex-col leading-tight md:flex">
              <span className="max-w-[220px] truncate text-[14px] font-bold">{name}</span>
              {roleLabel && <span className="text-[12px] font-semibold text-gold-text">{roleLabel}</span>}
            </span>
          )}
          <Icon name="chevron-down" size={16} strokeWidth={2.2} className={cx("hidden md:block", light ? "text-muted" : "text-gold-light")} />
        </button>
      )}
    >
      {(close) => (
        <>
          <div className="flex items-center gap-3 rounded-t-xl bg-navy-ink px-4 py-4 text-white">
            <Monogram initial={initial} size={44} ring />
            <div className="min-w-0">
              <p className="m-0 truncate text-[14.5px] font-bold" title={email}>
                {name}
              </p>
              {roleLabel && <p className="m-0 mt-0.5 text-[12.5px] font-semibold text-gold-light">{roleLabel}</p>}
            </div>
          </div>
          <MenuList
            label="Account"
            close={close}
            items={[
              { label: "Account settings", to: settingsPath },
              { label: "Sign out", onSelect: signOut },
            ]}
          />
        </>
      )}
    </Popover>
  );
}
