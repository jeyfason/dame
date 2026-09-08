import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    // Playwright specs run under `bun x playwright test`, not vitest.
    exclude: ["tests/*.spec.ts", "node_modules/**"],
  },
});
