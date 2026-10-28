import { describe, expect, it } from "vitest";
import { parseAddress } from "./places";

const c = (longText: string, types: string[], shortText = longText) => ({ longText, shortText, types });

describe("parseAddress", () => {
  it("reads street, city, county and ZIP from Google's components", () => {
    expect(
      parseAddress([
        c("1450", ["street_number"]),
        c("North Druid Hills Road Northeast", ["route"], "N Druid Hills Rd NE"),
        c("Brookhaven", ["locality", "political"]),
        c("DeKalb County", ["administrative_area_level_2", "political"]),
        c("Georgia", ["administrative_area_level_1", "political"], "GA"),
        c("30329", ["postal_code"]),
      ]),
    ).toEqual({ address: "1450 N Druid Hills Rd NE", city: "Brookhaven", county: "DeKalb", zip: "30329" });
  });

  it("falls back when there's no city", () => {
    expect(parseAddress([c("Tucker", ["sublocality"]), c("Gwinnett County", ["administrative_area_level_2"])])).toEqual({ address: "", city: "Tucker", county: "Gwinnett", zip: "" });
  });
});
