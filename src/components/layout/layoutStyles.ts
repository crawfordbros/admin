import { cx } from "../styles";

// Class names and constants shared by the Admin Portal and Property Portal layouts.

export const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/** Shared look for a sidebar link; `isActive` comes from NavLink. */
export const navItemClass = (isActive: boolean) =>
  cx(
    "flex min-h-[42px] items-center gap-3 rounded-[10px] px-3 text-[14.5px] font-semibold no-underline",
    isActive ? "bg-white text-navy-ink hover:text-navy-ink" : "text-on-navy hover:bg-white/10 hover:text-white",
  );

export const navGroupClass = (first: boolean) =>
  cx("mx-2.5 mb-1.5 font-sans text-[11px] font-bold tracking-[0.12em] text-nav-label uppercase", first ? "mt-2" : "mt-[18px]");

export const topbarClass = "sticky top-0 z-30 flex min-h-16 items-center gap-3 border-b border-line bg-white px-4 py-2.5 sm:gap-4 lg:px-7 print:hidden";
