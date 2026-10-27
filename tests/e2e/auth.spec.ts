import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const path of ["/admin", "/admin/users", "/admin/properties", "/portal", "/portal/properties/demo/report"]) {
  test(`${path} sends signed-out visitors to sign in`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/portal\/login/);
    await expect(page.getByRole("heading", { name: "Sign in to the CBES portal" })).toBeVisible();
  });
}

test("sign-in page offers no self sign-up and has no serious axe issues", async ({ page }) => {
  await page.goto("/portal/login");
  await expect(page.getByLabel("Email address")).toBeVisible();
  await expect(page.getByRole("link", { name: /sign up/i })).toHaveCount(0);
  await expect(page.getByText("Accounts are by invitation from CBES.")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
});

test("invitation link page offers account setup and has no serious axe issues", async ({ page }) => {
  await page.goto("/portal/accept-invite");
  await expect(page.getByText("Use the link in your invitation email from CBES.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" }).last()).toHaveAttribute("href", "/portal/login");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
});
