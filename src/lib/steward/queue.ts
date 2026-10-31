// The Steward app's outbox (STEWARD_APP_SPEC section 4, Offline): violations, check-ins and check-outs are
// saved on the phone first (IndexedDB), then sent; anything that can't reach the API waits and is retried
// when the phone is back online. Each item keeps the client id the API dedupes on, and its original time.

export type QueuedPhoto = { blob: Blob; takenAt: string | null };

export type QueuedViolation = {
  kind: "violation";
  id: string; // the clientId sent to the API
  userId: string;
  createdAt: string;
  data: {
    clientId: string;
    propertyId: string;
    building: string | null;
    unit: string;
    typeKey: string;
    note: string | null;
    loggedAt: string;
    lat?: number;
    lng?: number;
    gpsAccuracyM?: number;
    photoTakenAt: (string | null)[];
  };
  photos: QueuedPhoto[];
  /** What the list shows while it waits. */
  summary: { typeLabel: string; typeLabelEs: string | null; unit: string; building: string | null; propertyName: string };
  attempts: number;
  /** Set when the API refused it for good (not a network problem); it stays until removed. */
  failed?: string;
};

export type QueuedCheckIn = {
  kind: "check-in";
  id: string;
  userId: string;
  createdAt: string;
  data: { clientId: string; propertyId: string; lat: number | null; lng: number | null; accuracyM: number | null; reason?: string; at: string };
  summary: { propertyName: string };
  attempts: number;
  failed?: string;
};

export type QueuedCheckOut = {
  kind: "check-out";
  id: string;
  userId: string;
  createdAt: string;
  checkInId: string;
  data: { lat: number | null; lng: number | null; accuracyM: number | null; at: string };
  summary: { propertyName: string };
  attempts: number;
  failed?: string;
};

export type QueuedItem = QueuedViolation | QueuedCheckIn | QueuedCheckOut;

const DB_NAME = "cbes-steward";
const STORE = "outbox";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore(STORE, { keyPath: "id" });
      store.createIndex("userId", "userId");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = work(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export const putItem = (item: QueuedItem) => run("readwrite", (s) => s.put(item)).then(() => undefined);
export const removeItem = (id: string) => run("readwrite", (s) => s.delete(id)).then(() => undefined);

/** This person's waiting items, oldest first (the order they're sent in). */
export async function listItems(userId: string): Promise<QueuedItem[]> {
  const items = (await run("readonly", (s) => s.index("userId").getAll(userId))) as QueuedItem[];
  return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export const queueAvailable = () => typeof indexedDB !== "undefined";

/**
 * What to do after a send failed. No response (offline, timeout) and server errors are retried;
 * a refusal (403, 404, 409, 422) won't change by retrying, so the item is kept as failed for the person
 * to see. A sign-in problem (401) waits for the next sign-in.
 */
export function afterFailure(status: number): "retry" | "failed" {
  return status === 0 || status === 401 || status === 408 || status === 429 || status >= 500 ? "retry" : "failed";
}

/** A violation's upload: the facts as JSON in `data`, then the photos (POST /valet/violations). */
export function violationForm(item: QueuedViolation): FormData {
  const form = new FormData();
  // Empty fields (no building, no note) are left out rather than sent as null.
  form.append("data", JSON.stringify({ ...item.data, building: item.data.building ?? undefined, note: item.data.note ?? undefined }));
  item.photos.forEach((p, i) => form.append("photos", new File([p.blob], `photo-${i + 1}.jpg`, { type: p.blob.type || "image/jpeg" })));
  return form;
}
