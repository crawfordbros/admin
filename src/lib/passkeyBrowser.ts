export class PasskeyModuleLoadError extends Error {
  constructor(cause: unknown) {
    super("We couldn’t load passkey verification. Reload the page to try again.", { cause });
    this.name = "PasskeyModuleLoadError";
  }
}

/** Keep loading failures separate from device prompts and server verification. */
export async function loadPasskeyBrowser() {
  try {
    return await import("@simplewebauthn/browser");
  } catch (cause) {
    throw new PasskeyModuleLoadError(cause);
  }
}
