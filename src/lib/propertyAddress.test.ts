import { describe, expect, it } from "vitest";
import { propertyAddressText, propertyOptionLabel, validatePropertyAddress } from "./propertyAddress";

describe("property addresses", () => {
  it.each([
    [{ address: " 1 Main St ", city: " Decatur ", zip: "30030" }, "1 Main St, Decatur, GA 30030"],
    [{ address: null, city: "Decatur", zip: "30030" }, "Decatur, GA 30030 · Street address missing"],
    [{ address: "   ", city: null, zip: null }, "Street address missing"],
    [{ address: "1 Main St", city: null, zip: "30030" }, "1 Main St, GA 30030 · Address incomplete"],
    [{ address: "1 Main St", city: "Decatur", zip: null }, "1 Main St, Decatur, GA · Address incomplete"],
  ])("displays complete and legacy addresses without inventing missing parts", (property, expected) => {
    expect(propertyAddressText(property)).toBe(expected);
  });

  it("distinguishes same-name properties in native selectors", () => {
    const property = { name: "The Oaks", address: "1 Main St", city: "Decatur", zip: "30030-1234" };
    expect(propertyOptionLabel(property)).toBe("The Oaks — 1 Main St, Decatur, GA 30030-1234");
    expect(propertyOptionLabel({ ...property, address: "2 Main St" })).not.toBe(propertyOptionLabel(property));
  });

  it("accepts manual addresses and rejects blank fields and malformed ZIP codes", () => {
    expect(validatePropertyAddress({ address: " 1 Main St ", city: " Decatur ", zip: " 30030-1234 " })).toEqual({});
    expect(Object.keys(validatePropertyAddress({ address: " \t", city: null, zip: "30030abc" }))).toEqual(["address", "city", "zip"]);
  });
});
