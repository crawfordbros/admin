/* eslint-disable react-refresh/only-export-components -- the provider and its hook belong together */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { Icon } from "./icons";
import { cx } from "./styles";

type Toast = { id: number; tone: "success" | "danger"; message: string };
type ToastApi = { success: (message: string) => void; error: (message: string) => void };

const ToastContext = createContext<ToastApi | null>(null);

/** Notices after a save or a failed change. Each one stays 5 seconds; errors stay until closed. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (tone: Toast["tone"], message: string) => {
      const id = next.current++;
      setToasts((t) => [...t.slice(-2), { id, tone, message }]);
      if (tone === "success") setTimeout(() => dismiss(id), 5000);
    },
    [dismiss],
  );
  const api = useMemo<ToastApi>(() => ({ success: (m) => push("success", m), error: (m) => push("danger", m) }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-4 left-4 z-[60] flex flex-col items-end gap-2 sm:left-auto print:hidden">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === "danger" ? "alert" : "status"}
            className={cx(
              "anim-fade pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl px-4 py-3 text-[14px] font-semibold shadow-[0_12px_32px_rgba(26,28,94,0.22)]",
              t.tone === "success" ? "bg-navy-ink text-white" : "bg-danger text-white",
            )}
          >
            <Icon name={t.tone === "success" ? "check" : "alert-circle"} size={18} strokeWidth={2.2} className="mt-px flex-none" />
            <span className="flex-1">{t.message}</span>
            <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)} className="-m-1 flex size-7 flex-none items-center justify-center rounded-md hover:bg-white/15">
              <Icon name="x" size={15} strokeWidth={2.4} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast needs a ToastProvider");
  return api;
}
