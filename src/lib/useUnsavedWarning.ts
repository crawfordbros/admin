import { useEffect } from "react";

const MESSAGE = "You have unsaved changes. Leave without saving them?";

/**
 * Warns before leaving a page with unsaved changes: closing or reloading the tab, and following
 * any link to another page. (The app uses BrowserRouter, which has no navigation blocker, so
 * links are caught in the capture phase before React Router handles them.)
 */
export function useUnsavedWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const click = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!(a instanceof HTMLAnchorElement) || a.target === "_blank" || a.hasAttribute("download")) return;
      const to = new URL(a.href, window.location.href);
      if (to.origin === window.location.origin && to.pathname === window.location.pathname && to.search === window.location.search) return;
      if (!window.confirm(MESSAGE)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", click, true);
    };
  }, [dirty]);
}
