import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@clerk/clerk-react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError, errorMessage, useApi } from "../../lib/api";
import { OutboxContext } from "../../lib/steward/outbox";
import { afterFailure, listItems, putItem, queueAvailable, removeItem, violationForm, type QueuedItem } from "../../lib/steward/queue";

const RETRY_MS = 60_000;
/** A send that hasn't answered by then counts as no signal. */
const SEND_TIMEOUT_MS = 30_000;
/** Soon after a failure while the phone says it's online (signal often comes back in steps). */
const QUICK_RETRIES_MS = [5_000, 15_000, 30_000];

const withTimeout = <T,>(work: Promise<T>) =>
  Promise.race([work, new Promise<never>((_, reject) => setTimeout(() => reject(new ApiError(0, "The connection timed out.")), SEND_TIMEOUT_MS))]);

/**
 * Sends what the Steward app saved on the phone (lib/steward/queue.ts): right after it's saved, when the
 * phone comes back online, when the app is opened again, and every minute. Items go oldest first and
 * stop at the first one that can't reach the API, so they arrive in order.
 */
export function OutboxProvider({ children }: { children: ReactNode }) {
  const { userId } = useAuth();
  const api = useApi();
  const queries = useQueryClient();
  const [items, setItems] = useState<QueuedItem[]>([]);
  const sending = useRef(false);
  const again = useRef(false);
  const quick = useRef(0);
  const quickTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const available = queueAvailable();

  const reload = useCallback(async () => {
    if (!userId || !available) return;
    setItems(await listItems(userId));
  }, [available, userId]);

  const send = useCallback(
    (item: QueuedItem) => {
      if (item.kind === "violation") return api("/valet/violations", { method: "POST", body: violationForm(item) });
      if (item.kind === "check-in") return api("/valet/check-ins", { method: "POST", body: JSON.stringify(item.data) });
      return api(`/valet/check-ins/${item.checkInId}/checkout`, { method: "POST", body: JSON.stringify(item.data) });
    },
    [api],
  );

  /** One pass over the outbox, oldest first; true when something is still waiting for signal. */
  const pass = useCallback(async () => {
    let delivered = false;
    let waiting = false;
    for (const item of await listItems(userId!)) {
      if (item.failed) continue;
      try {
        await withTimeout(send(item));
        await removeItem(item.id);
        delivered = true;
      } catch (err) {
        const status = err instanceof ApiError ? err.status : 0;
        if (afterFailure(status) === "failed") {
          await putItem({ ...item, attempts: item.attempts + 1, failed: errorMessage(err) });
          continue;
        }
        await putItem({ ...item, attempts: item.attempts + 1 });
        waiting = true;
        break;
      }
    }
    if (delivered) void queries.invalidateQueries({ queryKey: ["crew"] });
    return waiting;
  }, [queries, send, userId]);

  const latest = useRef<() => Promise<void>>(async () => {});
  const flush = useCallback(async (): Promise<void> => {
    if (!userId || !available) return;
    // Asked again mid-send (Retry, back online): run once more when this pass ends.
    if (sending.current) {
      again.current = true;
      return;
    }
    sending.current = true;
    let waiting: boolean;
    try {
      do {
        again.current = false;
        waiting = await pass();
      } while (again.current);
    } finally {
      sending.current = false;
      await reload();
    }
    clearTimeout(quickTimer.current);
    if (!waiting) quick.current = 0;
    else if (navigator.onLine && quick.current < QUICK_RETRIES_MS.length) {
      quickTimer.current = setTimeout(() => void latest.current(), QUICK_RETRIES_MS[quick.current++]);
    }
  }, [available, pass, reload, userId]);
  useEffect(() => {
    latest.current = flush;
  }, [flush]);

  const enqueue = useCallback(
    async (item: QueuedItem) => {
      if (!available) {
        await send(item);
        void queries.invalidateQueries({ queryKey: ["crew"] });
        return true;
      }
      await putItem(item);
      await reload();
      await flush();
      return !(await listItems(item.userId)).some((i) => i.id === item.id);
    },
    [available, flush, queries, reload, send],
  );

  const remove = useCallback(
    async (id: string) => {
      await removeItem(id);
      await reload();
    },
    [reload],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads the phone's outbox and starts sending it
    void reload().then(flush);
    const retry = () => void flush();
    const online = () => {
      quick.current = 0;
      retry();
    };
    const visible = () => document.visibilityState === "visible" && retry();
    window.addEventListener("online", online);
    document.addEventListener("visibilitychange", visible);
    const timer = setInterval(retry, RETRY_MS);
    return () => {
      window.removeEventListener("online", online);
      document.removeEventListener("visibilitychange", visible);
      clearInterval(timer);
      clearTimeout(quickTimer.current);
    };
  }, [flush, reload]);

  const value = useMemo(() => ({ items, enqueue, flush, remove, available }), [items, enqueue, flush, remove, available]);
  return <OutboxContext.Provider value={value}>{children}</OutboxContext.Provider>;
}
