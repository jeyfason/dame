import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Playwright specs run under `bun x playwright test`, not vitest.
    exclude: ["tests/*.spec.ts", "node_modules/**"],
  },
});
