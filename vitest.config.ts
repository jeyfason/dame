import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Playwright smoke spec runs under `bun x playwright test`, not vitest.
    exclude: ["tests/smoke.spec.ts", "node_modules/**"],
  },
});
