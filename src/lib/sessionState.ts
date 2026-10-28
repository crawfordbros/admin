export const IDLE_MS = 30 * 60_000;
export const WARNING_MS = 28 * 60_000;
export const ACTIVITY_INTERVAL_MS = 15_000;
export type EndReason = "idle" | "expired" | "signout";
export const AUTH_EVENT = "cbes:auth";
export const ACTIVITY_EVENT = "cbes:activity";
export type AuthEvent = { sessionId: string; code: string };

const activity = new Map<string, number>();
const ended = new Map<string, EndReason>();
const controllers = new Map<string, AbortController>();
let channel: BroadcastChannel | undefined;
function sharedChannel() {
  if (!channel && typeof window.BroadcastChannel === "function") {
    try {
      channel = new window.BroadcastChannel("cbes:portal-sessions");
      channel.onmessage = ({ data }: MessageEvent<unknown>) => {
        if (!data || typeof data !== "object" || !("sessionId" in data) || typeof data.sessionId !== "string") return;
        const id = data.sessionId;
        if ("reason" in data && (data.reason === "idle" || data.reason === "expired" || data.reason === "signout")) {
          ended.set(id, data.reason);
          save(endedKey(id), data.reason);
          controllers.get(id)?.abort();
          notifyAuth(id, data.reason === "idle" ? "session_idle_timeout" : "session_ended");
        } else if ("at" in data && typeof data.at === "number" && Number.isFinite(data.at) && data.at > 0 && !endReason(id)) {
          activity.set(id, Math.max(lastActivity(id) ?? 0, data.at));
          window.dispatchEvent(new CustomEvent(ACTIVITY_EVENT, { detail: { sessionId: id } }));
        }
      };
    } catch { /* Storage events and server enforcement remain available. */ }
  }
  return channel;
}
export const activityKey = (id: string) => `cbes:portal:${id}:activity`;
export const endedKey = (id: string) => `cbes:portal:${id}:ended`;

function stored(key: string) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function save(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* The API still enforces expiry without storage. */ }
}
export function lastActivity(id: string): number | null {
  sharedChannel();
  const value = Number(stored(activityKey(id)));
  return Math.max(activity.get(id) ?? 0, Number.isFinite(value) ? value : 0) || null;
}
export function endReason(id: string): EndReason | null {
  const value = stored(endedKey(id));
  return ended.get(id) ?? (value === "idle" || value === "expired" || value === "signout" ? value : null);
}
export function publishActivity(id: string, at: number) {
  if (endReason(id)) return;
  const latest = Math.max(lastActivity(id) ?? 0, at);
  activity.set(id, latest);
  save(activityKey(id), String(latest));
  sharedChannel()?.postMessage({ sessionId: id, at: latest });
  window.dispatchEvent(new CustomEvent(ACTIVITY_EVENT, { detail: { sessionId: id } }));
}
export function sessionSignal(id: string) {
  if (!controllers.has(id)) controllers.set(id, new AbortController());
  return controllers.get(id)!.signal;
}
export function notifyAuth(id: string, code: string) {
  window.dispatchEvent(new CustomEvent<AuthEvent>(AUTH_EVENT, { detail: { sessionId: id, code } }));
}
export function endSession(id: string, reason: EndReason) {
  const existing = endReason(id);
  ended.set(id, existing ?? reason);
  save(endedKey(id), existing ?? reason);
  sharedChannel()?.postMessage({ sessionId: id, reason: existing ?? reason });
  controllers.get(id)?.abort();
  notifyAuth(id, (existing ?? reason) === "idle" ? "session_idle_timeout" : "session_ended");
}

/** Persisted tombstones deliberately survive when a Clerk session is replaced. */
export function releaseSession(id: string) {
  controllers.get(id)?.abort();
  controllers.delete(id);
  activity.delete(id);
  ended.delete(id);
}
