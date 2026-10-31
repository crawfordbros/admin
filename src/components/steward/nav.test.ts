import { describe, expect, it } from "vitest";
import { crewView, tabsFor } from "./nav";

describe("Steward tabs", () => {
  it("gives valets and Stewards their own five tabs", () => {
    expect(tabsFor("valet").map((t) => t.key)).toEqual(["tonight", "violations", "issues", "property", "me"]);
    expect(tabsFor("steward").map((t) => t.key)).toEqual(["tonight", "crew", "review", "issues", "me"]);
  });

  it("shows Stewards and previewing admins the Steward tabs", () => {
    expect(crewView("lead")).toBe("steward");
    expect(crewView("admin")).toBe("steward");
    expect(crewView("super_admin")).toBe("steward");
    expect(crewView("valet")).toBe("valet");
  });
});
