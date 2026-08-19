import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  webServer: {
    command: "npm run e2e:seed && npm run dev",
    env: { DB_FILE_NAME: ".tmp/e2e.sqlite", SESSION_COOKIE_SECURE: "false" },
    port: 3000,
    reuseExistingServer: false,
  },
  use: { baseURL: "http://127.0.0.1:3000", trace: "retain-on-failure" },
  projects: [
    { name: "tablet", grep: /@tablet/, use: { ...devices["iPad (gen 7) landscape"] } },
    { name: "parent-mobile", grep: /@parent/, dependencies: ["tablet"], use: { ...devices["iPhone 13"] } },
  ],
});
