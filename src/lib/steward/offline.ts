import { ApiError } from "../api";

// The last good copy of what Tonight needs (STEWARD_APP_SPEC section 8: tonight's assignments work without
// signal), kept on the phone per person and used only when the API can't be reached.

const PREFIX = "steward.copy.";

export type MaybeOffline<T> = T & { offline?: true };

export async function withOfflineCopy<T extends object>(userId: string | null | undefined, key: string, load: () => Promise<T>): Promise<MaybeOffline<T>> {
  const storageKey = `${PREFIX}${userId}.${key}`;
  try {
    const data = await load();
    try {
      if (userId) localStorage.setItem(storageKey, JSON.stringify(data));
    } catch {
      // Storage full or blocked: the app still works online.
    }
    return data;
  } catch (err) {
    if (userId && err instanceof ApiError && err.status === 0) {
      const saved = localStorage.getItem(storageKey);
      if (saved) return { ...(JSON.parse(saved) as T), offline: true };
    }
    throw err;
  }
}

/** Removes every saved copy, for signing out on a shared phone. */
export function clearOfflineCopies() {
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith(PREFIX)) localStorage.removeItem(key);
  } catch {
    // Nothing saved.
  }
}
