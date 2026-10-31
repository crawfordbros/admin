import { endReason, endSession, IDLE_MS, lastActivity, notifyAuth, sessionSignal } from "./sessionState";

export class ApiError extends Error {
  constructor(readonly status: number, message: string, readonly fieldErrors: Record<string, string> = {}, readonly details: Record<string, unknown> = {}) {
    super(message);
  }
}
export class SessionTransition extends ApiError {
  constructor() { super(401, "Returning to sign in…"); }
}
type GetToken = (options?: { skipCache?: boolean }) => Promise<string | null>;
type Auth = { sessionId?: string | null; getToken: GetToken };
type Options = { forceRefresh?: boolean; ending?: boolean };
type Refresh = { rejected: string | null; promise: Promise<string | null>; completedAt?: number };
const refreshes = new Map<string | GetToken, Refresh>();

export function clearTokenRefresh(sessionId: string) { refreshes.delete(sessionId); }

function ensureActive(id?: string | null) {
  if (!id) return;
  const at = lastActivity(id);
  const reason = endReason(id) ?? (at !== null && Date.now() - at >= IDLE_MS ? "idle" : null);
  if (reason) {
    endSession(id, reason);
    throw new SessionTransition();
  }
}
async function token(auth: Auth, refresh = false, rejected: string | null = null) {
  try {
    if (!refresh) return await auth.getToken();
    const key = auth.sessionId ?? auth.getToken;
    const previous = refreshes.get(key);
    if (previous?.rejected === rejected && (previous.completedAt === undefined || Date.now() - previous.completedAt < 5000)) return await previous.promise;
    const next: Refresh = { rejected, promise: auth.getToken({ skipCache: true }) };
    refreshes.set(key, next);
    try { return await next.promise; }
    catch (err) { if (refreshes.get(key) === next) refreshes.delete(key); throw err; }
    finally {
      next.completedAt = Date.now();
      if (rejected === null && refreshes.get(key) === next) refreshes.delete(key);
    }
  } catch (err) {
    const codes = err && typeof err === "object" && "errors" in err && Array.isArray(err.errors)
      ? err.errors.map((e: { code?: string }) => e.code) : [];
    if (codes.some((code) => ["session_not_found", "session_expired", "session_revoked", "session_ended", "signed_out"].includes(code ?? ""))) {
      if (auth.sessionId) endSession(auth.sessionId, "expired");
      throw new SessionTransition();
    }
    throw new ApiError(0, "We couldn't reach the sign-in service. Check your connection and try again.");
  }
}

/** Retry only a request explicitly rejected by authentication, before its handler could run. */
export async function authenticatedRequest(auth: Auth, path: string, init: RequestInit = {}, options: Options = {}): Promise<Response> {
  if (!options.ending) ensureActive(auth.sessionId);
  let bearer = await token(auth, options.forceRefresh);
  const controller = new AbortController();
  const signals = [init.signal, !options.ending && auth.sessionId ? sessionSignal(auth.sessionId) : null].filter((s): s is AbortSignal => Boolean(s));
  const abort = () => controller.abort();
  for (const signal of signals) {
    if (signal.aborted) abort();
    signal.addEventListener("abort", abort, { once: true });
  }
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (!options.ending) ensureActive(auth.sessionId);
      if (!bearer) {
        if (auth.sessionId && !options.ending) endSession(auth.sessionId, "expired");
        throw new SessionTransition();
      }
      if (controller.signal.aborted) throw new DOMException("Request cancelled", "AbortError");
      const headers = new Headers(init.headers);
      headers.set("Authorization", `Bearer ${bearer}`);
      if (typeof init.body === "string" && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
      let response: Response;
      try {
        response = await fetch(`/api${path}`, { ...init, headers, credentials: "same-origin", cache: "no-store", signal: controller.signal });
      } catch (err) {
        if (controller.signal.aborted) throw new DOMException("Request cancelled", "AbortError");
        throw new ApiError(0, "We couldn't reach the server. Check your connection and try again.", {}, { cause: err });
      }
      if (!options.ending) ensureActive(auth.sessionId);
      if (controller.signal.aborted) throw new DOMException("Request cancelled", "AbortError");
      if (response.headers.get("cf-mitigated") === "challenge") {
        throw new ApiError(response.status, "The site's security service interrupted verification. Reload this page and try again.");
      }
      if (response.ok || response.status === 404) {
        // Keep the session abort listener attached until JSON/files finish downloading, not just
        // until response headers arrive. No protected response may escape after a session ends.
        const body = response.body ? await response.arrayBuffer().catch(() => {
          if (controller.signal.aborted) throw new DOMException("Request cancelled", "AbortError");
          throw new ApiError(0, "The download was interrupted. Check your connection and try again.");
        }) : null;
        if (!options.ending) ensureActive(auth.sessionId);
        if (controller.signal.aborted) throw new DOMException("Request cancelled", "AbortError");
        // A 204/205/304 may still arrive with an empty body stream; Response() rejects any body for them.
        const nullBody = response.status === 204 || response.status === 205 || response.status === 304;
        return new Response(nullBody ? null : body, { status: response.status, statusText: response.statusText, headers: response.headers });
      }
      const body = await response.clone().json().catch(() => ({})) as { code?: string; error?: string; fieldErrors?: Record<string, string> };
      if (response.status === 401) {
        const retryable = body.code === "token_expired" || !body.code;
        if (retryable && attempt === 0 && !(init.body instanceof ReadableStream)) {
          bearer = await token(auth, true, bearer);
          continue;
        }
        if (!options.ending && auth.sessionId) endSession(auth.sessionId, body.code === "session_idle_timeout" ? "idle" : "expired");
        throw new SessionTransition();
      }
      if (response.status === 403 && body.code === "mfa_required" && auth.sessionId) notifyAuth(auth.sessionId, "mfa_required");
      const fallback = response.status >= 500
        ? "The service is temporarily unavailable. Please try again."
        : "Something went wrong. Please try again.";
      throw new ApiError(response.status, body.error ?? fallback, body.fieldErrors, body);
    }
    throw new SessionTransition();
  } finally {
    for (const signal of signals) signal.removeEventListener("abort", abort);
  }
}

export async function responseJson<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => { throw new ApiError(res.status, "The service is temporarily unavailable. Please try again."); });
  if (!res.ok) throw new ApiError(res.status, body.error ?? "Something went wrong. Please try again.", body.fieldErrors, body);
  return body as T;
}
