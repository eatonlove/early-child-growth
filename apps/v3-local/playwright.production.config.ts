import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "production.spec.ts",
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5302",
    channel: "chrome",
    headless: true,
  },
  webServer: {
    command: "VITE_APP_MODE=production VITE_API_BASE_URL= npm run dev -- --host 127.0.0.1 --port 5302",
    url: "http://127.0.0.1:5302",
    reuseExistingServer: true,
    timeout: 120000,
  },
});
