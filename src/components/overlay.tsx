import { useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./icons";
import { cx } from "./styles";
import { useFocusTrap } from "./useFocusTrap";

type DialogProps = {
  title: string;
  /** A line above the title, such as the organization the dialog belongs to. */
  context?: ReactNode;
  icon?: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
};

function CloseButton({ onClose, onNavy }: { onClose: () => void; onNavy?: boolean }) {
  return (
    <button
      type="button"
      aria-label="Close"
      onClick={onClose}
      className={cx(
        "flex size-10 flex-none items-center justify-center rounded-[10px] border",
        onNavy ? "border-navy-soft text-white hover:bg-white/10" : "border-line text-ink hover:bg-canvas",
      )}
    >
      <Icon name="x" size={18} strokeWidth={2.2} />
    </button>
  );
}

/** A centered dialog. Route-driven modals pass an onClose that navigates back. */
export function Modal({ title, context, icon, onClose, footer, children, size = "md", tone = "light" }: DialogProps & { size?: "md" | "lg"; tone?: "light" | "navy" }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useFocusTrap(ref, onClose);
  const navy = tone === "navy";

  return createPortal(
    <div className="anim-fade fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-navy-night/70 p-4 sm:p-10" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cx("flex w-full flex-col overflow-hidden rounded-[20px] bg-white shadow-[0_24px_60px_rgba(10,12,40,0.45)] focus:outline-none", size === "lg" ? "max-w-[900px]" : "max-w-[640px]")}
      >
        <div className={cx("flex items-start justify-between gap-4 px-5 py-5 sm:px-7", navy ? "bg-navy-ink text-white" : "border-b border-line")}>
          <div className="flex min-w-0 items-center gap-3.5">
            {icon}
            <div className="min-w-0">
              {context && <p className={cx("m-0 text-[13px] font-semibold", navy ? "text-gold-light" : "text-muted")}>{context}</p>}
              <h1 id={titleId} className={cx("m-0 text-[22px] sm:text-2xl", navy ? "text-white" : "text-navy-ink")}>
                {title}
              </h1>
            </div>
          </div>
          <CloseButton onClose={onClose} onNavy={navy} />
        </div>
        <div className="px-5 py-6 sm:px-7">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-subtle px-5 py-4 sm:px-7">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** A panel that slides in from the right, for details opened over a list. */
export function Drawer({ title, context, icon, onClose, footer, children }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useFocusTrap(ref, onClose);

  return createPortal(
    <div className="anim-fade fixed inset-0 z-50 flex justify-end bg-navy-night/50" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="anim-drawer flex h-full w-full max-w-[560px] flex-col bg-white shadow-[-12px_0_40px_rgba(10,12,40,0.25)] focus:outline-none"
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-5 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            {icon}
            <div className="min-w-0">
              {context && <p className="m-0 text-[13px] font-semibold text-muted">{context}</p>}
              <h1 id={titleId} className="m-0 text-[22px] text-navy-ink">
                {title}
              </h1>
            </div>
          </div>
          <CloseButton onClose={onClose} />
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-4 sm:px-6">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
