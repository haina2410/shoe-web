import { defineConfig } from "@playwright/test";

const baseURL = process.env.SMOKE_BASE_URL;
if (!baseURL) {
  throw new Error("SMOKE_BASE_URL is required for production smoke tests");
}

export default defineConfig({
  testDir: "./e2e",
  testMatch: "production-smoke.spec.ts",
  workers: 1,
  retries: 1,
  reporter: "line",
  outputDir: "/tmp/playwright-smoke-results",
  use: {
    baseURL,
    extraHTTPHeaders: { "cache-control": "no-cache" },
  },
});
