import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: {
    baseURL: "http://127.0.0.1:5300",
    viewport: { width: 1440, height: 1000 },
    channel: "chrome",
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1",
    url: "http://127.0.0.1:5300",
    reuseExistingServer: true,
  },
});
