// Dame Stage 1 smoke tests (Playwright).
//
// Requires a running dev server: `bun dev` on E2E_BASE_URL (default
// http://localhost:3000) plus Clerk test keys for sign-up.
// Documented skip without env: `SKIP_E2E=1 bun x playwright test tests/smoke.spec.ts`
// skips the suite instead of failing with connection errors.
import { test, expect } from "@playwright/test";

const base = process.env.E2E_BASE_URL ?? "http://localhost:3000";

test.skip(!!process.env.SKIP_E2E, "Documented skip: no dev server / Clerk env available.");

test.describe("dame smoke", () => {
  test("landing loads", async ({ page }) => {
    await page.goto(base);
    await expect(page.getByRole("heading", { name: /chess\.com, but for checkers/i })).toBeVisible();
  });

  test("sign-up redirects", async ({ page }) => {
    await page.goto(`${base}/sign-up`);
    await expect(page).toHaveURL(/sign-up/);
  });

  test("profile renders", async ({ page }) => {
    await page.goto(`${base}/profile/smoke-test-id`);
    await expect(page.getByText(/profile|player|sign in/i).first()).toBeVisible();
  });
});
