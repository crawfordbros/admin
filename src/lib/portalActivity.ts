import { ACTIVITY_EVENT, ACTIVITY_INTERVAL_MS, activityKey, endedKey, endReason, endSession, IDLE_MS, lastActivity, publishActivity, WARNING_MS } from "./sessionState";

export type SessionStatus = { serverTime: number; lastActivityAt: number; expiresAt: number };
export type ActivitySnapshot = { ready: boolean; remaining: number; warning: boolean; error: string };
type Options = {
  sessionId: string;
  status: () => Promise<SessionStatus>;
  sendActivity: (ageMs: number) => Promise<SessionStatus>;
  change: (snapshot: ActivitySnapshot) => void;
};

/** Activity comes only from the protected portal. Timers, focus, and network reads never renew it. */
export class PortalActivity {
  private ready = false;
  private stopped = false;
  private error = "";
  private lastSent = -Infinity;
  private pending: number | null = null;
  private sending = false;
  private interval?: ReturnType<typeof setInterval>;
  private trailing?: ReturnType<typeof setTimeout>;
  constructor(private readonly options: Options) {}

  async start() {
    if (!this.interval) this.interval = setInterval(this.check, 1000);
    try {
      const status = await this.options.status();
      if (this.stopped) return;
      if (![status.serverTime, status.lastActivityAt, status.expiresAt].every(Number.isFinite)) throw new Error("The service is temporarily unavailable. Please try again.");
      if (status.expiresAt <= status.serverTime) return this.end();
      const serverActivity = Date.now() - (status.serverTime - status.lastActivityAt);
      const previous = lastActivity(this.options.sessionId);
      publishActivity(this.options.sessionId, serverActivity);
      this.ready = true;
      this.error = "";
      if (!this.check()) return;
      // A reload may interrupt a trailing activity update. Carry its original time forward.
      if (previous !== null && previous > serverActivity) { this.pending = previous; void this.flush(); }
      if (!this.interval) this.interval = setInterval(this.check, 1000);
      window.addEventListener("storage", this.onStorage);
      window.addEventListener(ACTIVITY_EVENT, this.check);
      window.addEventListener("focus", this.check);
      window.addEventListener("pageshow", this.check);
      window.addEventListener("pagehide", this.onPageHide);
      window.addEventListener("online", this.onOnline);
      document.addEventListener("visibilitychange", this.onVisibility);
    } catch (err) {
      if (this.stopped) return;
      this.error = err instanceof Error ? err.message : "The service is temporarily unavailable. Please try again.";
      this.check();
    }
  }

  private end() {
    endSession(this.options.sessionId, endReason(this.options.sessionId) ?? "idle");
    return false;
  }
  check = (): boolean => {
    if (this.stopped) return false;
    const at = lastActivity(this.options.sessionId);
    const remaining = at === null ? IDLE_MS : Math.max(0, at + IDLE_MS - Date.now());
    if (endReason(this.options.sessionId) || (at !== null && remaining === 0)) return this.end();
    this.options.change({ ready: this.ready, remaining, warning: this.ready && remaining <= IDLE_MS - WARNING_MS, error: this.error });
    return true;
  };

  interact(trusted: boolean, confirm = false) {
    if (!this.check() || !this.ready || !trusted || document.visibilityState !== "visible") return;
    const at = lastActivity(this.options.sessionId)!;
    if (!confirm && Date.now() - at >= WARNING_MS) return;
    this.pending = Date.now();
    publishActivity(this.options.sessionId, this.pending);
    this.check();
    if (confirm || Date.now() - this.lastSent >= ACTIVITY_INTERVAL_MS) void this.flush();
    else if (!this.trailing) this.trailing = setTimeout(() => { this.trailing = undefined; void this.flush(); }, ACTIVITY_INTERVAL_MS - (Date.now() - this.lastSent));
  }

  private async flush() {
    if (this.sending || this.pending === null || !this.check()) return;
    if (this.trailing) clearTimeout(this.trailing);
    this.trailing = undefined;
    const at = this.pending;
    this.sending = true;
    this.lastSent = Date.now();
    try {
      await this.options.sendActivity(Math.max(0, Date.now() - at));
      if (this.pending === at) this.pending = null;
      this.error = "";
    } catch {
      this.error = "We couldn't update your session. Check your connection and try again.";
    } finally {
      this.sending = false;
      if (!this.stopped) {
        this.check();
        // Flush newer input once, without turning a failed ping into a keepalive loop.
        if (this.pending !== null && this.pending !== at && !this.trailing) {
          this.trailing = setTimeout(() => { this.trailing = undefined; void this.flush(); }, Math.max(0, ACTIVITY_INTERVAL_MS - (Date.now() - this.lastSent)));
        }
      }
    }
  }
  private onStorage = (event: StorageEvent) => {
    if (event.key === activityKey(this.options.sessionId) || event.key === endedKey(this.options.sessionId)) this.check();
  };
  private onVisibility = () => {
    if (!this.check()) return;
    if (document.visibilityState === "hidden") void this.flush();
  };
  private onOnline = () => { if (this.check()) void this.flush(); };
  private onPageHide = () => { if (this.check()) void this.flush(); };

  stop() {
    // Flush already observed input on route teardown; this does not count navigation as input.
    if (this.pending !== null) void this.flush();
    this.stopped = true;
    clearInterval(this.interval);
    clearTimeout(this.trailing);
    window.removeEventListener("storage", this.onStorage);
    window.removeEventListener(ACTIVITY_EVENT, this.check);
    window.removeEventListener("focus", this.check);
    window.removeEventListener("pageshow", this.check);
    window.removeEventListener("pagehide", this.onPageHide);
    window.removeEventListener("online", this.onOnline);
    document.removeEventListener("visibilitychange", this.onVisibility);
  }
}
