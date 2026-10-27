import { describe, expect, it } from "vitest";
import { afterSignInPath } from "./redirect";

const origin = "https://cbenvironments.com";
const from = (url: string) => afterSignInPath(`?redirect_url=${encodeURIComponent(url)}`, origin);

describe("afterSignInPath", () => {
  it("defaults to the portal", () => {
    expect(afterSignInPath("", origin)).toBe("/portal");
  });

  it("returns to a page on this site", () => {
    expect(from("https://cbenvironments.com/admin/properties?tab=active")).toBe("/admin/properties?tab=active");
    expect(from("/portal/properties/p1")).toBe("/portal/properties/p1");
  });

  it("ignores other sites and the sign-in page itself", () => {
    expect(from("https://evil.example/portal")).toBe("/portal");
    expect(from("//evil.example/portal")).toBe("/portal");
    expect(from("https://cbenvironments.com/portal/login")).toBe("/portal");
  });
});
