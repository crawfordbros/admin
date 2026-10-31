import { createContext, useContext } from "react";
import type { QueuedItem } from "./queue";

export type Outbox = {
  /** This person's items still on the phone, oldest first. */
  items: QueuedItem[];
  /** Saves an item on the phone and tries to send it right away. Resolves true once the API has it. */
  enqueue: (item: QueuedItem) => Promise<boolean>;
  /** Tries to send everything waiting. */
  flush: () => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** False where the browser has no IndexedDB (private modes on some phones): items are sent directly. */
  available: boolean;
};

export const OutboxContext = createContext<Outbox | null>(null);

export function useOutbox(): Outbox {
  const value = useContext(OutboxContext);
  if (!value) throw new Error("useOutbox needs OutboxProvider");
  return value;
}
