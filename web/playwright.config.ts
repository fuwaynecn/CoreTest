import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  webServer: {
    command: "npm run e2e:seed:phase2 && npm run dev",
    env: { DB_FILE_NAME: ".tmp/e2e.sqlite", SESSION_COOKIE_SECURE: "false" },
    port: 3000,
    reuseExistingServer: false,
  },
  use: { baseURL: "http://127.0.0.1:3000", trace: "retain-on-failure" },
  projects: [
    {
      name: "tablet-webkit",
      grep: /@tablet/,
      use: { ...devices["iPad (gen 7) landscape"], browserName: "webkit" },
    },
    {
      name: "tablet-chromium",
      grep: /@tablet(?!.*@full-diagnosis)/,
      use: { ...devices["iPad (gen 7) landscape"], browserName: "chromium", channel: "chrome" },
    },
    {
      name: "parent-mobile",
      grep: /@parent/,
      dependencies: ["tablet-webkit"],
      use: { ...devices["iPhone 13"], browserName: "webkit" },
    },
  ],
});
