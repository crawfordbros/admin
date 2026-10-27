import { defineConfig, devices } from "@playwright/test";

// Signed-out checks against the dev server. They load Clerk from its servers, so they need network.
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  reporter: [["list"]],
  expect: { timeout: 15_000 },
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5174", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: { command: "pnpm dev", url: "http://localhost:5174", reuseExistingServer: true, timeout: 60_000 },
});
