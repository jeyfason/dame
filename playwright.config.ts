import { defineConfig } from "@playwright/test";

// Playwright E2E specs (*.spec.ts). Vitest unit tests (*.test.ts) run under
// `bun x vitest run`, not here.
// Local keyless run: E2E_BYPASS_AUTH=1 bun dev --port 3100, then
// E2E_BASE_URL=http://localhost:3100 bun x playwright test tests/play.spec.ts
// If Playwright browsers are not installed, point at a system Chrome:
// PLAYWRIGHT_CHROME_PATH=/usr/bin/google-chrome bun x playwright test
const chromePath = process.env.PLAYWRIGHT_CHROME_PATH;

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  use: {
    launchOptions: chromePath
      ? { executablePath: chromePath, args: ["--no-sandbox", "--disable-dev-shm-usage"] }
      : {},
  },
});
