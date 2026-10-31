import { afterEach, describe, expect, it, vi } from "vitest";
import { loadPasskeyBrowser, PasskeyModuleLoadError } from "./passkeyBrowser";

afterEach(() => {
  vi.doUnmock("@simplewebauthn/browser");
  vi.resetModules();
});

describe("loadPasskeyBrowser", () => {
  it("classifies an import rejection and preserves its cause", async () => {
    vi.doMock("@simplewebauthn/browser", () => {
      throw new TypeError("Failed to fetch dynamically imported module: https://example.com/module.js");
    });
    const importError: unknown = await import("@simplewebauthn/browser").catch((error: unknown) => error);
    const error: unknown = await loadPasskeyBrowser().catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(PasskeyModuleLoadError);
    expect(error).toMatchObject({
      message: "We couldn’t load passkey verification. Reload the page to try again.",
      cause: importError,
    });
  });

  it("returns the browser functions without handling credential prompt errors", async () => {
    const cancelled = new DOMException("Cancelled", "NotAllowedError");
    const startAuthentication = vi.fn().mockRejectedValue(cancelled);
    const startRegistration = vi.fn();
    vi.doMock("@simplewebauthn/browser", () => ({ startAuthentication, startRegistration }));
    const browser = await loadPasskeyBrowser();
    expect(browser.startRegistration).toBe(startRegistration);
    expect(browser.startAuthentication).toBe(startAuthentication);
    expect(startAuthentication).not.toHaveBeenCalled();
    await expect(browser.startAuthentication({ optionsJSON: { challenge: "test" } })).rejects.toBe(cancelled);
  });
});
