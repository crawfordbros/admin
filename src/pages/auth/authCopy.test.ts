import { describe, expect, it } from "vitest";
import { AUTH_EN, AUTH_ES } from "./authCopy";

describe("sign-in copy", () => {
  it("has Spanish for every English string and error", () => {
    expect(Object.keys(AUTH_ES).sort()).toEqual(Object.keys(AUTH_EN).sort());
    expect(Object.keys(AUTH_ES.errors).sort()).toEqual(Object.keys(AUTH_EN.errors).sort());
    for (const [key, value] of Object.entries(AUTH_ES)) {
      if (typeof value === "string") expect(value.trim(), key).not.toBe("");
    }
  });

  it("fills in the code's destination and the resend countdown", () => {
    expect(AUTH_ES.emailCodeIntro("m***@email.com")).toContain("m***@email.com");
    expect(AUTH_ES.resendIn(12)).toContain("12");
  });
});
