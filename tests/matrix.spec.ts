// Dame Stage 6 Task 2 — Responsive matrix (Playwright).
//
// Viewport matrix 360/768/1280 on /play (local board): no-x-scroll, board
// fit (every square inside the board box), 44px touch targets on controls.
// Realtime layout (mocked room via tests/helpers/mock-room, no worker):
// chat stacks below the board on mobile, sits beside it on desktop.
//
// Requires a running dev server (no worker, no secrets):
//   E2E_BYPASS_AUTH=1 bun dev --port 3101
// Run: E2E_BASE_URL=http://localhost:3101 \
//      PLAYWRIGHT_CHROME_PATH=/usr/bin/google-chrome \
//      bun x playwright test tests/matrix.spec.ts
// Documented skip without env: `SKIP_E2E=1 bun x playwright test tests/matrix.spec.ts`
import { test, expect } from "@playwright/test";
import { mockRoom } from "./helpers/mock-room";

const base = process.env.E2E_BASE_URL ?? "http://localhost:3100";

test.skip(!!process.env.SKIP_E2E, "Documented skip: no dev server available.");

const VIEWPORTS = [
  { name: "mobile 360", width: 360, height: 800 },
  { name: "tablet 768", width: 768, height: 1024 },
  { name: "desktop 1280", width: 1280, height: 800 },
] as const;

for (const vp of VIEWPORTS) {
  test.describe(`viewport ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test("no horizontal scroll on /play", async ({ page }) => {
      await page.goto(`${base}/play`);
      await expect(page.getByTestId("board")).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
    });

    test("board fits viewport and every square stays inside the board", async ({
      page,
    }) => {
      await page.goto(`${base}/play`);
      await expect(page.getByTestId("board")).toBeVisible();
      const fit = await page.evaluate(() => {
        const board = document.querySelector('[data-testid="board"]');
        if (!board) return { ok: false as const, reason: "no board" };
        const b = board.getBoundingClientRect();
        if (b.width > window.innerWidth + 1 || b.x < -1) {
          return {
            ok: false as const,
            reason: `board box x=${b.x} w=${b.width} viewport=${window.innerWidth}`,
          };
        }
        const squares = Array.from(
          board.querySelectorAll('[data-testid^="square-"]'),
        );
        for (const sq of squares) {
          const s = (sq as HTMLElement).getBoundingClientRect();
          if (s.left < b.left - 1 || s.right > b.right + 1) {
            return {
              ok: false as const,
              reason: `${(sq as HTMLElement).dataset.testid} [${s.left},${s.right}] outside board [${b.left},${b.right}]`,
            };
          }
        }
        return { ok: true as const, reason: "" };
      });
      expect(fit.reason).toBe("");
      expect(fit.ok).toBe(true);
    });

    test("touch targets are 44px on controls", async ({ page }) => {
      await page.goto(`${base}/play`);
      await expect(page.getByTestId("board")).toBeVisible();
      for (const id of ["reset-button", "sound-toggle"]) {
        const box = await page.getByTestId(id).boundingBox();
        expect(box, id).not.toBeNull();
        expect(box!.height, `${id} height`).toBeGreaterThanOrEqual(44);
      }
    });
  });
}

test.describe("realtime layout (mocked room)", () => {
  test("mobile 360: chat stacks below the board, no x-scroll", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await mockRoom(page, { role: "white" });
    await page.goto(`${base}/play/${crypto.randomUUID()}?role=white`);
    await expect(page.getByTestId("board")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("chat-panel")).toBeVisible({ timeout: 10_000 });

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);

    const stacked = await page.evaluate(() => {
      const board = document.querySelector('[data-testid="board"]')!;
      const chat = document.querySelector('[data-testid="chat-panel"]')!;
      const b = board.getBoundingClientRect();
      const c = chat.getBoundingClientRect();
      return { boardBottom: b.bottom, chatTop: c.top, chatLeft: c.left, boardLeft: b.left };
    });
    expect(stacked.chatTop).toBeGreaterThanOrEqual(stacked.boardBottom - 2);

    const sendBox = await page.getByTestId("chat-send").boundingBox();
    expect(sendBox).not.toBeNull();
    expect(sendBox!.height).toBeGreaterThanOrEqual(44);
  });

  test("desktop 1280: chat sits beside the board", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await mockRoom(page, { role: "white" });
    await page.goto(`${base}/play/${crypto.randomUUID()}?role=white`);
    await expect(page.getByTestId("board")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("chat-panel")).toBeVisible({ timeout: 10_000 });

    const side = await page.evaluate(() => {
      const board = document.querySelector('[data-testid="board"]')!;
      const chat = document.querySelector('[data-testid="chat-panel"]')!;
      const b = board.getBoundingClientRect();
      const c = chat.getBoundingClientRect();
      return { boardRight: b.right, chatLeft: c.left };
    });
    expect(side.chatLeft).toBeGreaterThanOrEqual(side.boardRight - 2);
  });
});
