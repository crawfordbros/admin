import { describe, expect, it } from "vitest";
import { en, es, translate } from "./strings";

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("Steward strings", () => {
  it("has a Spanish string for every English one, and no extras", () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
    for (const [key, text] of Object.entries(es)) expect(text.trim(), key).not.toBe("");
  });

  it("uses the same placeholders in both languages", () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(placeholders(es[key]), key).toEqual(placeholders(en[key]));
    }
  });

  it("fills placeholders and leaves unknown ones visible", () => {
    expect(translate("en", "greeting.evening", { name: "Marcus" })).toBe("Good evening, Marcus");
    expect(translate("es", "greeting.evening", { name: "Marcus" })).toBe("Buenas noches, Marcus");
    expect(translate("en", "greeting.evening")).toBe("Good evening, {name}");
  });
});
