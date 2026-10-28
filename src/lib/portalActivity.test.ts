import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PortalActivity, type ActivitySnapshot } from "./portalActivity";
import { activityKey, endedKey, endReason, IDLE_MS, lastActivity, releaseSession, WARNING_MS } from "./sessionState";

const id = "activity-session";
let controllers: PortalActivity[] = [];
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-28T12:00:00Z"));
  localStorage.clear();
  releaseSession(id);
  releaseSession("other-device");
});
afterEach(() => {
  controllers.forEach((c) => c.stop());
  controllers = [];
  vi.useRealTimers();
  vi.restoreAllMocks();
  releaseSession(id);
  releaseSession("other-device");
  localStorage.clear();
});

async function open(sessionId = id, initial = Date.now()) {
  let snapshot: ActivitySnapshot | undefined;
  const sendActivity = vi.fn(async (age: number) => ({ serverTime: Date.now(), lastActivityAt: Date.now() - age, expiresAt: Date.now() - age + IDLE_MS }));
  const controller = new PortalActivity({
    sessionId,
    status: async () => ({ serverTime: Date.now(), lastActivityAt: initial, expiresAt: initial + IDLE_MS }),
    sendActivity,
    change: (next) => { snapshot = next; },
  });
  controllers.push(controller);
  await controller.start();
  return { controller, sendActivity, snapshot: () => snapshot! };
}

describe("portal activity", () => {
  it("warns at 28 minutes and expires at exactly 30 without background keepalives", async () => {
    const tab = await open();
    await vi.advanceTimersByTimeAsync(WARNING_MS - 1);
    expect(tab.snapshot().warning).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(tab.snapshot()).toMatchObject({ warning: true, remaining: 120_000 });
    await vi.advanceTimersByTimeAsync(120_000);
    expect(endReason(id)).toBe("idle");
    expect(tab.sendActivity).not.toHaveBeenCalled();
  });

  it("keeps active work alive and flushes the last event's age instead of the timer time", async () => {
    const tab = await open();
    await vi.advanceTimersByTimeAsync(60_000);
    tab.controller.interact(true);
    await vi.advanceTimersByTimeAsync(5000);
    tab.controller.interact(true);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(tab.sendActivity.mock.calls.map(([age]) => age)).toEqual([0, 10_000]);
    expect(lastActivity(id)).toBe(Date.now() - 10_000);
    for (let i = 0; i < 3; i++) {
      await vi.advanceTimersByTimeAsync(20 * 60_000);
      tab.controller.interact(true);
    }
    expect(endReason(id)).toBeNull();
  });

  it("requires confirmation once warned and renews all tabs when confirmed", async () => {
    const tab = await open();
    const other = await open();
    await vi.advanceTimersByTimeAsync(WARNING_MS);
    tab.controller.interact(true); // pointer movement inside warning is not confirmation
    expect(tab.snapshot().warning).toBe(true);
    expect(tab.sendActivity).not.toHaveBeenCalled();
    tab.controller.interact(true, true);
    expect(tab.snapshot().warning).toBe(false);
    expect(other.snapshot().warning).toBe(false);
    await vi.advanceTimersByTimeAsync(3 * 60_000);
    expect(endReason(id)).toBeNull();
  });

  it("preserves inactivity through a reload and expires before accepting input after sleep", async () => {
    const initial = Date.now();
    const tab = await open();
    await vi.advanceTimersByTimeAsync(25 * 60_000);
    tab.controller.stop();
    const reload = await open(id, initial);
    expect(reload.snapshot().remaining).toBe(5 * 60_000);
    vi.setSystemTime(Date.now() + 6 * 60_000); // background timers did not run
    reload.controller.interact(true, true);
    expect(endReason(id)).toBe("idle");
    expect(reload.sendActivity).not.toHaveBeenCalled();
  });

  it("ignores synthetic events, hidden tabs, focus, and visibility changes", async () => {
    const tab = await open();
    const initial = lastActivity(id);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    tab.controller.interact(false);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    tab.controller.interact(true);
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
    expect(lastActivity(id)).toBe(initial);
    expect(tab.sendActivity).not.toHaveBeenCalled();
  });

  it("receives activity and sign-out from other tabs, but isolates another session", async () => {
    const tab = await open();
    const otherDevice = await open("other-device");
    await vi.advanceTimersByTimeAsync(WARNING_MS);
    localStorage.setItem(activityKey(id), String(Date.now()));
    window.dispatchEvent(new StorageEvent("storage", { key: activityKey(id) }));
    expect(tab.snapshot().warning).toBe(false);
    expect(otherDevice.snapshot().warning).toBe(true);
    localStorage.setItem(endedKey(id), "signout");
    window.dispatchEvent(new StorageEvent("storage", { key: endedKey(id) }));
    expect(endReason(id)).toBe("signout");
    expect(endReason("other-device")).toBeNull();
  });

  it("keeps an outage distinct from expiry and never renews failed activity on reconnect", async () => {
    const tab = await open();
    tab.sendActivity.mockRejectedValue(new Error("offline"));
    await vi.advanceTimersByTimeAsync(60_000);
    tab.controller.interact(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(tab.snapshot().error).toContain("couldn't update");
    expect(endReason(id)).toBeNull();
    await vi.advanceTimersByTimeAsync(IDLE_MS);
    window.dispatchEvent(new Event("online"));
    expect(endReason(id)).toBe("idle");
    expect(tab.sendActivity).toHaveBeenCalledTimes(1);
  });

  it("flushes recent input on page exit without counting the exit as activity", async () => {
    const tab = await open();
    tab.controller.interact(true);
    await vi.advanceTimersByTimeAsync(5000);
    tab.controller.interact(true);
    const at = lastActivity(id);
    await vi.advanceTimersByTimeAsync(1000);
    window.dispatchEvent(new Event("pagehide"));
    expect(tab.sendActivity.mock.calls.map(([age]) => age)).toEqual([0, 1000]);
    expect(lastActivity(id)).toBe(at);
  });
});
