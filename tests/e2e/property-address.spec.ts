import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("addresses wrap and same-name properties retain distinct selections", async ({ page }) => {
  await page.route("**/api/**", (route) => route.abort());
  await page.goto("/tests/fixtures/property-address.html");
  const header = page.getByRole("region", { name: "Property header" });
  const title = await header.getByRole("heading").boundingBox();
  const address = await header.getByText(/12345 North Peachtree/).boundingBox();
  expect(address!.y).toBeGreaterThanOrEqual(title!.y + title!.height);
  await expect(page.getByRole("table")).toContainText("Atlanta, GA · Street address missing");
  await page.getByRole("checkbox", { name: /The Oaks 2 South Main St/ }).locator("..").click();
  await expect(page.getByRole("checkbox", { name: /The Oaks 2 South Main St/ })).toBeChecked();
  await expect(page.getByRole("status", { name: "Selected IDs" })).toHaveText("south");
  await page.getByRole("button", { name: "Choose property", exact: true }).click();
  await page.getByRole("menuitem", { name: /The Oaks 2 South Main St/ }).click();
  await expect(page.getByRole("status", { name: "Current ID" })).toHaveText("south");
  await page.getByRole("combobox", { name: "Property", exact: true }).selectOption("north");
  await expect(page.getByRole("status", { name: "Current ID" })).toHaveText("north");
  await page.getByRole("button", { name: "Property: All" }).click();
  await page.getByRole("dialog", { name: "Property filter" }).getByRole("checkbox", { name: /The Oaks 12345/ }).check();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("list", { name: "Active filters" })).toContainText("12345 North Peachtree");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
