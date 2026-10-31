import { describe, expect, it } from "vitest";
import { violationDetail } from "../test/fixtures";
import { buildCourtesyNotices } from "./courtesy-pdf";

describe("courtesy notices", () => {
  const v = violationDetail({
    status: "sent",
    sentBy: { id: "user_admin", name: "Nigel Crawford", role: "admin" },
    courtesy: { propertyAddress: "3400 Scott Blvd", propertyCity: "Decatur", officePhone: "404-555-0100", logoVersion: null },
  });

  it("addresses the unit and gives the office's number", () => {
    const text = buildCourtesyNotices([{ v, photo: null, logo: null }], new Date("2026-10-28T15:00:00Z")).output();
    expect(text).toContain("Courtesy notice");
    expect(text).toContain("To the resident of Building 4, Unit 412");
    expect(text).toContain("404-555-0100");
    expect(text).toContain("Ref V-2041");
  });

  it("never names the valet or anyone at CBES", () => {
    const text = buildCourtesyNotices([{ v, photo: null, logo: null }]).output();
    for (const name of ["Marcus Hill", "Dana Brooks", "Nigel Crawford", "CBES", "CB Environment"]) expect(text).not.toContain(name);
  });

  it("puts each violation on its own page", () => {
    const doc = buildCourtesyNotices([{ v, photo: null, logo: null }, { v: { ...v, refNo: 2042 }, photo: null, logo: null }]);
    expect(doc.getNumberOfPages()).toBe(2);
  });
});
