import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keeps Tab inside `ref` while it's mounted, closes on Escape, and puts focus back where it was
 * when it unmounts. The first field (or the panel itself) gets focus on open.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, onClose: () => void) {
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    const panel = ref.current;
    if (!panel) return;
    const opener = document.activeElement as HTMLElement | null;
    const items = () => [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
    (panel.querySelector<HTMLElement>("[data-autofocus]") ?? items().find((el) => el.tagName !== "BUTTON") ?? panel).focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // An open combobox or menu inside the dialog (address suggestions, a popover) closes first.
        if ((e.target as Element | null)?.closest?.('[aria-expanded="true"]')) return;
        e.stopPropagation();
        close.current();
      }
      if (e.key !== "Tab") return;
      const list = items();
      if (list.length === 0) return e.preventDefault();
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    panel.addEventListener("keydown", onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      panel.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      opener?.focus?.();
    };
  }, [ref]);
}
