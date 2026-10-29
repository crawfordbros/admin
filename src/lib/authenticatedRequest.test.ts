import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authenticatedRequest, clearTokenRefresh, responseJson, SessionTransition } from "./authenticatedRequest";
import { AUTH_EVENT, endReason, endSession, IDLE_MS, publishActivity, releaseSession } from "./sessionState";

const id = "request-session";
beforeEach(() => { localStorage.clear(); releaseSession(id); clearTokenRefresh(id); });
afterEach(() => { releaseSession(id); clearTokenRefresh(id); localStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const expired = () => Response.json({ code: "token_expired", error: "Sign in" }, { status: 401 });

describe("authenticated request recovery", () => {
  it("shares a refresh across concurrent expired JSON, MFA, and blob requests", async () => {
    const getToken = vi.fn(async (options?: { skipCache?: boolean }) => options?.skipCache ? "fresh" : "old");
    const fetcher = vi.fn(async (_url, init: RequestInit) => new Headers(init.headers).get("Authorization") === "Bearer old" ? expired() : Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetcher);
    const auth = { sessionId: id, getToken };
    const responses = await Promise.all(["/portal/me", "/auth/mfa/status", "/portal/image"].map((path) => authenticatedRequest(auth, path)));
    expect(responses.every((r) => r.ok)).toBe(true);
    expect(getToken.mock.calls.filter(([opts]) => opts?.skipCache)).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(6);
    expect(endReason(id)).toBeNull();
  });

  it.each([JSON.stringify({ name: "New name" }), new FormData()])("replays an auth-rejected write with the original body and custom headers", async (body) => {
    const fetcher = vi.fn().mockResolvedValueOnce(expired()).mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetcher);
    const getToken = vi.fn(async (options?: { skipCache?: boolean }) => options?.skipCache ? "fresh" : "old");
    const result = await authenticatedRequest({ sessionId: id, getToken }, "/portal/property", { method: "PATCH", body, headers: { "X-Custom": "value" } });
    expect(await responseJson(result)).toBeUndefined();
    for (const [, init] of fetcher.mock.calls) {
      expect(init.method).toBe("PATCH");
      expect(init.body).toBe(body);
      expect(init.headers.get("X-Custom")).toBe("value");
    }
  });

  it("returns a 204 even when the network layer hands back an empty body stream", async () => {
    // Behind proxies, a 204 can arrive with a non-null (empty) body; re-wrapping it must not throw.
    const noContent = { ok: true, status: 204, statusText: "No Content", headers: new Headers(), body: new ReadableStream(), arrayBuffer: async () => new ArrayBuffer(0) } as unknown as Response;
    vi.stubGlobal("fetch", vi.fn(async () => noContent));
    const result = await authenticatedRequest({ sessionId: id, getToken: async () => "token" }, "/organizations/o/invitations/i", { method: "DELETE" });
    expect(result.status).toBe(204);
    expect(await responseJson(result)).toBeUndefined();
  });

  it("locks after a rejected fresh token without a retry loop", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => expired()));
    const getToken = vi.fn(async () => "token");
    await expect(authenticatedRequest({ sessionId: id, getToken }, "/portal/me")).rejects.toBeInstanceOf(SessionTransition);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(endReason(id)).toBe("expired");
  });

  it("does not refresh an explicitly expired idle session", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ code: "session_idle_timeout" }, { status: 401 })));
    const getToken = vi.fn(async () => "token");
    await expect(authenticatedRequest({ sessionId: id, getToken }, "/auth/mfa/status")).rejects.toBeInstanceOf(SessionTransition);
    expect(getToken).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(endReason(id)).toBe("idle");
  });

  it("blocks before fetching or refreshing when returning after the local deadline", async () => {
    publishActivity(id, Date.now() - IDLE_MS);
    vi.stubGlobal("fetch", vi.fn());
    const getToken = vi.fn(async () => "token");
    await expect(authenticatedRequest({ sessionId: id, getToken }, "/portal/me")).rejects.toBeInstanceOf(SessionTransition);
    expect(getToken).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([502, 503])("does not sign out or replay a write after an HTML %s", async (status) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>Bad gateway</html>", { status })));
    await expect(authenticatedRequest({ sessionId: id, getToken: async () => "token" }, "/portal/save", { method: "POST", body: "{}" })).rejects.toMatchObject({ status, message: expect.stringContaining("temporarily unavailable") });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(endReason(id)).toBeNull();
  });

  it("does not confuse a refresh network failure with a revoked session", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => expired()));
    const getToken = vi.fn(async (opts?: { skipCache?: boolean }) => { if (opts?.skipCache) throw new TypeError("offline"); return "old"; });
    await expect(authenticatedRequest({ sessionId: id, getToken }, "/portal/me")).rejects.toMatchObject({ status: 0 });
    expect(endReason(id)).toBeNull();
    getToken.mockResolvedValue("fresh");
    vi.mocked(fetch).mockResolvedValue(Response.json({ ok: true }));
    expect((await authenticatedRequest({ sessionId: id, getToken }, "/portal/me")).ok).toBe(true);
  });

  it("signals MFA recovery without signing out, and preserves permission errors", async () => {
    const listener = vi.fn();
    window.addEventListener(AUTH_EVENT, listener);
    try {
      vi.stubGlobal("fetch", vi.fn(async () => Response.json({ code: "mfa_required" }, { status: 403 })));
      await expect(authenticatedRequest({ sessionId: id, getToken: async () => "token" }, "/portal/me")).rejects.toMatchObject({ status: 403 });
      expect(listener.mock.calls[0][0].detail).toEqual({ sessionId: id, code: "mfa_required" });
      expect(endReason(id)).toBeNull();
      vi.mocked(fetch).mockResolvedValue(Response.json({ error: "Not allowed" }, { status: 403 }));
      await expect(authenticatedRequest({ sessionId: id, getToken: async () => "token" }, "/admin/users")).rejects.toMatchObject({ status: 403, message: "Not allowed" });
      expect(listener).toHaveBeenCalledTimes(1);
    } finally { window.removeEventListener(AUTH_EVENT, listener); }
  });

  it("aborts pending requests on logout, while permitting the session-end request", async () => {
    let pendingSignal: AbortSignal | undefined;
    let resolve: (res: Response) => void = () => {};
    vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
      pendingSignal = init.signal;
      return new Promise<Response>((done) => { resolve = done; });
    }));
    const auth = { sessionId: id, getToken: async () => "token" };
    const pending = authenticatedRequest(auth, "/portal/me");
    const rejected = expect(pending).rejects.toBeInstanceOf(SessionTransition);
    await vi.waitFor(() => expect(pendingSignal).toBeDefined());
    endSession(id, "idle");
    expect(pendingSignal?.aborted).toBe(true);
    resolve(Response.json({ private: "data" }));
    await rejected;
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));
    expect((await authenticatedRequest(auth, "/auth/session/end", { method: "POST" }, { ending: true })).status).toBe(204);
  });

  it("gets a new forced token after each authenticator confirmation", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ stepUpToken: "proof" })));
    const getToken = vi.fn(async () => "fresh");
    for (let i = 0; i < 2; i++) await authenticatedRequest({ sessionId: id, getToken }, "/auth/step-up/authenticator", { method: "POST" }, { forceRefresh: true });
    expect(getToken).toHaveBeenCalledTimes(2);
  });

  it("does not reuse an old refresh result after returning from sleep", async () => {
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    const getToken = vi.fn(async (opts?: { skipCache?: boolean }) => opts?.skipCache ? "fresh" : "old");
    vi.stubGlobal("fetch", vi.fn(async (_url, init) => new Headers(init.headers).get("Authorization") === "Bearer old" ? expired() : Response.json({ ok: true })));
    const auth = { sessionId: id, getToken };
    await authenticatedRequest(auth, "/portal/me");
    clock.mockReturnValue(now + 60_000);
    await authenticatedRequest(auth, "/portal/me");
    expect(getToken.mock.calls.filter(([opts]) => opts?.skipCache)).toHaveLength(2);
  });

  it("cancels a file whose headers arrived but whose body is still downloading", async () => {
    let started = false;
    vi.stubGlobal("fetch", vi.fn(async (_url, init) => new Response(new ReadableStream({
      start(controller) {
        started = true;
        init.signal.addEventListener("abort", () => controller.error(new DOMException("Cancelled", "AbortError")));
      },
    }), { headers: { "Content-Type": "image/png" } })));
    const pending = authenticatedRequest({ sessionId: id, getToken: async () => "token" }, "/portal/photo");
    const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(started).toBe(true));
    endSession(id, "idle");
    await rejected;
  });
});
