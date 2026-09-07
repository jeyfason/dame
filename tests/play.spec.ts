// Dame Stage 2 Task 4 — LocalBoard E2E (Playwright).
//
// Requires a running dev server on E2E_BASE_URL (default http://localhost:3100).
// /play is Clerk-protected; for local E2E start dev keyless with:
//   E2E_BYPASS_AUTH=1 bun dev --port 3100
// Documented skip without env: `SKIP_E2E=1 bun x playwright test tests/play.spec.ts`
import { test, expect } from "@playwright/test";

const base = process.env.E2E_BASE_URL ?? "http://localhost:3100";

test.skip(!!process.env.SKIP_E2E, "Documented skip: no dev server / Clerk env available.");

test.describe("local 2-player board", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${base}/play`);
  });

  test("board renders 100 squares", async ({ page }) => {
    await expect(page.getByTestId("board")).toBeVisible();
    await expect(page.locator('[data-testid^="square-"]')).toHaveCount(100);
    await expect(page.getByTestId("turn-label")).toContainText(/white/i);
  });

  test("click piece shows dests", async ({ page }) => {
    await page.getByTestId("square-6-1").click();
    await expect(page.locator('[data-testid^="dest-"]')).not.toHaveCount(0);
    await expect(page.getByTestId("dest-5-2")).toBeVisible();
  });

  test("illegal click toasts", async ({ page }) => {
    // Black piece on white's turn: opponent piece is illegal.
    await page.getByTestId("square-3-0").click();
    await expect(page.getByText(/illegal/i).first()).toBeVisible();
  });

  test("turn label flips after move", async ({ page }) => {
    await expect(page.getByTestId("turn-label")).toContainText(/white/i);
    await page.getByTestId("square-6-1").click();
    await page.getByTestId("square-5-2").click();
    await expect(page.getByTestId("turn-label")).toContainText(/black/i);
  });

  test("reset restores white turn", async ({ page }) => {
    await page.getByTestId("square-6-1").click();
    await page.getByTestId("square-5-2").click();
    await expect(page.getByTestId("turn-label")).toContainText(/black/i);
    await page.getByTestId("reset-button").click();
    await expect(page.getByTestId("turn-label")).toContainText(/white/i);
    await expect(page.locator('[data-testid^="square-"]')).toHaveCount(100);
  });

  test("no premature winner lock after first move", async ({ page }) => {
    await expect(page.getByTestId("winner-banner")).toHaveCount(0);
    await page.getByTestId("square-6-1").click();
    await page.getByTestId("square-5-2").click();
    await expect(page.getByTestId("winner-banner")).toHaveCount(0);
    await expect(page.getByTestId("turn-label")).toContainText(/black/i);
  });
});
