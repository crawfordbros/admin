import { beforeEach, describe, expect, it } from "vitest";
import { ordinal, recentUnits, rememberUnit, typeName } from "./violations";

describe("crew violations", () => {
  beforeEach(() => localStorage.clear());

  it("names a type in the app's language, falling back to English", () => {
    expect(typeName({ label: "Over-filled", labelEs: "Demasiado lleno" }, "es")).toBe("Demasiado lleno");
    expect(typeName({ label: "Over-filled", labelEs: null }, "es")).toBe("Over-filled");
    expect(typeName({ typeLabel: "Bag not tied", typeLabelEs: "Bolsa sin amarrar" }, "en")).toBe("Bag not tied");
  });

  it("remembers the last three units per property", () => {
    for (const u of ["108", "214", "122", "108"]) rememberUnit("p1", u);
    expect(recentUnits("p1")).toEqual(["108", "122", "214"]);
    expect(recentUnits("p2")).toEqual([]);
  });

  it("writes repeat counts as ordinals", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map((n) => ordinal(n, "en"))).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd"]);
    expect(ordinal(3, "es")).toBe("3.ª");
  });
});
