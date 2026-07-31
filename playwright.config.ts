import "dotenv/config";
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testIgnore: ["**/production-smoke.spec.ts"],
  use: { baseURL: "http://localhost:3000" },
  webServer: {
    command: "npm run build && node scripts/start-standalone.mjs",
    url: "http://localhost:3000",
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
});
