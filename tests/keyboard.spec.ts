// Dame Stage 6 Task 2 — Keyboard play + live announcements (Playwright).
//
// Full local game driven by keyboard only (arrows + Enter, no mouse):
// focus moves, select announces, moves announce (incl. captures), turn
// flips, reset works. Realtime board (mocked room, no worker) plays its
// opening by keyboard too.
//
// Requires a running dev server (no worker, no secrets):
//   E2E_BYPASS_AUTH=1 bun dev --port 3101
// Run: E2E_BASE_URL=http://localhost:3101 \
//      PLAYWRIGHT_CHROME_PATH=/usr/bin/google-chrome \
//      bun x playwright test tests/keyboard.spec.ts
// Documented skip without env: `SKIP_E2E=1 bun x playwright test tests/keyboard.spec.ts`
import { test, expect, type Page } from "@playwright/test";
import { mockRoom } from "./helpers/mock-room";

const base = process.env.E2E_BASE_URL ?? "http://localhost:3100";

test.skip(!!process.env.SKIP_E2E, "Documented skip: no dev server available.");

async function activeSquare(page: Page): Promise<string | null> {
  return page.evaluate(
    () => document.activeElement?.getAttribute("data-testid") ?? null,
  );
}

async function enterSquare(page: Page, id: string): Promise<void> {
  await page.getByTestId(id).focus();
  await page.getByTestId(id).press("Enter");
}

test.describe("local board keyboard play", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${base}/play`);
    await expect(page.getByTestId("board")).toBeVisible();
  });

  test("arrow keys move focus between squares", async ({ page }) => {
    await page.getByTestId("square-6-1").focus();
    await page.getByTestId("square-6-1").press("ArrowRight");
    expect(await activeSquare(page)).toBe("square-6-2");
    await page.getByTestId("square-6-2").press("ArrowDown");
    expect(await activeSquare(page)).toBe("square-7-2");
    await page.getByTestId("square-7-2").press("ArrowLeft");
    expect(await activeSquare(page)).toBe("square-7-1");
    await page.getByTestId("square-7-1").press("ArrowUp");
    expect(await activeSquare(page)).toBe("square-6-1");
  });

  test("arrows stay inside the board at the edges", async ({ page }) => {
    await page.getByTestId("square-0-0").focus();
    await page.getByTestId("square-0-0").press("ArrowUp");
    expect(await activeSquare(page)).toBe("square-0-0");
    await page.getByTestId("square-0-0").press("ArrowLeft");
    expect(await activeSquare(page)).toBe("square-0-0");
    await page.getByTestId("square-9-9").focus();
    await page.getByTestId("square-9-9").press("ArrowDown");
    expect(await activeSquare(page)).toBe("square-9-9");
    await page.getByTestId("square-9-9").press("ArrowRight");
    expect(await activeSquare(page)).toBe("square-9-9");
  });

  test("square labels name color, kind and coordinates", async ({ page }) => {
    await expect(page.getByTestId("square-6-1")).toHaveAttribute(
      "aria-label",
      /white.*man.*row 6.*column 1/i,
    );
    await expect(page.getByTestId("square-3-0")).toHaveAttribute(
      "aria-label",
      /black.*man.*row 3.*column 0/i,
    );
    await expect(page.getByTestId("square-5-2")).toHaveAttribute(
      "aria-label",
      /empty.*row 5.*column 2/i,
    );
  });

  test("full game by keyboard: moves, capture, announcements, reset", async ({
    page,
  }) => {
    const announce = page.getByTestId("move-announcement");
    await expect(announce).toHaveAttribute("aria-live", "polite");
    await expect(announce).toContainText(/white to move/i);

    // White opens 6,1 -> 5,2 entirely by keyboard.
    await enterSquare(page, "square-6-1");
    await expect(page.getByTestId("dest-5-2")).toBeVisible();
    await expect(announce).toContainText(/selected/i);
    await enterSquare(page, "square-5-2");
    await expect(page.getByTestId("turn-label")).toContainText(/black/i);
    await expect(page.getByTestId("piece-5-2")).toBeVisible();
    await expect(announce).toContainText(
      /white moved from row 6 column 1 to row 5 column 2/i,
    );

    // Black replies 3,0 -> 4,1 by keyboard.
    await enterSquare(page, "square-3-0");
    await enterSquare(page, "square-4-1");
    await expect(page.getByTestId("turn-label")).toContainText(/white/i);
    await expect(announce).toContainText(
      /black moved from row 3 column 0 to row 4 column 1/i,
    );

    // White captures 5,2 x 4,1 -> 3,0 by keyboard.
    await enterSquare(page, "square-5-2");
    await enterSquare(page, "square-3-0");
    await expect(page.getByTestId("turn-label")).toContainText(/black/i);
    await expect(page.getByTestId("piece-4-1")).toHaveCount(0);
    await expect(page.getByTestId("piece-3-0")).toBeVisible();
    await expect(announce).toContainText(/capturing 1/i);

    // Reset by keyboard restores the opening.
    await page.getByTestId("reset-button").focus();
    await page.getByTestId("reset-button").press("Enter");
    await expect(page.getByTestId("turn-label")).toContainText(/white/i);
    await expect(page.getByTestId("piece-6-1")).toBeVisible();
  });

  test("keyboard focus shows a visible ring", async ({ page }) => {
    // Real Tab presses from the top until a board square takes focus.
    let focused: string | null = null;
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press("Tab");
      focused = await activeSquare(page);
      if (focused?.startsWith("square-")) break;
    }
    expect(focused?.startsWith("square-")).toBe(true);
    const ring = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return { focusVisible: false, outline: "", shadow: "" };
      const cs = getComputedStyle(el);
      return {
        focusVisible: el.matches(":focus-visible"),
        outline: `${cs.outlineStyle} ${cs.outlineWidth}`,
        shadow: cs.boxShadow,
      };
    });
    expect(ring.focusVisible).toBe(true);
    expect(`${ring.outline} ${ring.shadow}`).not.toMatch(/none\s+0px\s+none/);
  });
});

test.describe("realtime board keyboard play (mocked room)", () => {
  test("opening move by keyboard with announcements", async ({ page }) => {
    await mockRoom(page, { role: "white" });
    await page.goto(`${base}/play/${crypto.randomUUID()}?role=white`);
    await expect(page.getByTestId("board")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("presence-label")).toContainText(/live/i, {
      timeout: 20_000,
    });

    // Arrow navigation works on the online board.
    await page.getByTestId("square-6-1").focus();
    await page.getByTestId("square-6-1").press("ArrowRight");
    expect(await activeSquare(page)).toBe("square-6-2");
    await page.getByTestId("square-6-2").press("ArrowLeft");
    expect(await activeSquare(page)).toBe("square-6-1");

    const announce = page.getByTestId("move-announcement");
    await expect(announce).toHaveAttribute("aria-live", "polite");

    await enterSquare(page, "square-6-1");
    await expect(page.getByTestId("dest-5-2")).toBeVisible({ timeout: 10_000 });
    await enterSquare(page, "square-5-2");
    await expect(page.getByTestId("turn-label")).toContainText(/black/i, {
      timeout: 15_000,
    });
    await expect(page.getByTestId("piece-5-2")).toBeVisible({ timeout: 15_000 });
    await expect(announce).toContainText(
      /white moved from row 6 column 1 to row 5 column 2/i,
      { timeout: 15_000 },
    );
  });
});
