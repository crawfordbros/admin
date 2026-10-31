import { expect, test, type Locator, type Page } from "@playwright/test";

const scroller = (page: Page) => page.getByRole("table", { name: "Users" }).locator("..");
const metrics = (element: Locator) => element.evaluate((el) => ({ height: el.clientHeight, scrollHeight: el.scrollHeight, width: el.clientWidth, scrollWidth: el.scrollWidth, top: el.scrollTop, left: el.scrollLeft }));

async function openMenu(page: Page, name = "Person 1") {
  const trigger = page.getByRole("button", { name: `Actions for ${name}`, exact: true });
  await trigger.scrollIntoViewIfNeeded();
  const before = await metrics(scroller(page));
  await trigger.click();
  await expect(page.getByRole("menu")).toBeVisible();
  expect(await metrics(scroller(page))).toEqual(before);
  return trigger;
}

async function expectInViewport(page: Page) {
  const box = await page.getByRole("menu").locator("..").boundingBox();
  const viewport = page.viewportSize()!;
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(15);
  expect(box!.y).toBeGreaterThanOrEqual(15);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width - 15);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height - 15);
}

test.beforeEach(async ({ page }) => {
  // Fixture tests exercise real components without Clerk or any backend writes.
  await page.route("**/api/**", (route) => route.abort());
});

test("a single-row menu escapes clipping and opens dialogs with focus restored", async ({ page }) => {
  await page.goto("/tests/fixtures/menu.html");
  const trigger = await openMenu(page);
  await expectInViewport(page);
  expect(await page.getByRole("menu").evaluate((el) => el.closest("table"))).toBeNull();
  for (const name of ["Change role", "View activity", "Remove access"]) {
    // A trial click checks hit testing as well as visibility, catching clipping by ancestors.
    await page.getByRole("menuitem", { name, exact: true }).click({ trial: true });
  }
  await page.getByRole("menuitem", { name: "Change role", exact: true }).click();
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Name" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.getByRole("menuitem", { name: "View activity" }).click();
  await expect(page.getByRole("dialog", { name: "Activity" })).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(trigger).toBeFocused();
  await expect(page.getByRole("status", { name: "Row clicks" })).toHaveText("0");
});

test("menus flip above bottom rows and scroll internally in short viewports", async ({ page }) => {
  await page.goto("/tests/fixtures/menu.html?bottom&long");
  const trigger = await openMenu(page);
  await expectInViewport(page);
  const menuBox = await page.getByRole("menu").locator("..").boundingBox();
  const triggerBox = await trigger.boundingBox();
  expect(menuBox!.y + menuBox!.height).toBeLessThanOrEqual(triggerBox!.y - 7);
  const panel = page.getByRole("menu").locator("..");
  expect(await panel.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  const before = await metrics(scroller(page));
  await page.keyboard.press("End");
  await expect(page.getByRole("menuitem", { name: "Remove access" })).toBeFocused();
  await page.getByRole("menuitem", { name: "Remove access" }).click();
  await expect(page.getByRole("dialog", { name: "Remove access" })).toBeVisible();
  expect(await metrics(scroller(page))).toEqual(before);
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});

test("menus follow table and page scrolling, resize, and close when their row is clipped", async ({ page }) => {
  await page.goto("/tests/fixtures/menu.html?many");
  const trigger = await openMenu(page, "Person 8");
  const offset = async () => {
    const menu = await page.getByRole("menu").locator("..").boundingBox();
    const button = await trigger.boundingBox();
    return menu!.y - button!.y;
  };
  const initialOffset = await offset();
  await scroller(page).evaluate((el) => { el.scrollTop += 20; });
  await expect.poll(offset).toBeCloseTo(initialOffset, 0);
  await page.evaluate(() => window.scrollBy(0, 20));
  await expect.poll(offset).toBeCloseTo(initialOffset, 0);
  const viewport = page.viewportSize()!;
  // Keep the trigger visible during resize; shrinking past it correctly dismisses the menu.
  await page.setViewportSize({ width: viewport.width + 80, height: viewport.height + 80 });
  await expect(page.getByRole("menu")).toBeVisible();
  await expectInViewport(page);
  const horizontalOffset = async () => {
    const menu = await page.getByRole("menu").locator("..").boundingBox();
    const button = await trigger.boundingBox();
    return menu!.x + menu!.width - button!.x - button!.width;
  };
  await scroller(page).evaluate((el) => { el.scrollLeft -= 20; });
  await expect.poll(horizontalOffset).toBeCloseTo(0, 0);
  // Move the row fully above the scroll container's visible area.
  await scroller(page).evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await expect(page.getByRole("menu")).toHaveCount(0);
  await openMenu(page, "Person 40");
  await expectInViewport(page);
});

test("keyboard and pointer dismissal keep the expected focus and do not activate rows", async ({ page }) => {
  await page.goto("/tests/fixtures/menu.html");
  const trigger = await openMenu(page);
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowUp");
  await expect(page.getByRole("menuitem", { name: "View activity" })).toBeFocused();
  await page.keyboard.press("Home");
  await expect(page.getByRole("menuitem", { name: "Change role" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "After table" })).toBeFocused();
  await trigger.click();
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("row").last()).toBeFocused();
  await trigger.click();
  await page.getByRole("button", { name: "Before table" }).click();
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Before table" })).toBeFocused();
  await expect(page.getByRole("status", { name: "Row clicks" })).toHaveText("0");
});
