// Dame Stage 3 Task 4 — 2-client realtime sync (Playwright).
//
// Requires linked local stack:
//   worker: GAME_TOKEN_SECRET=<same> bunx wrangler dev --port 8787   (worker/)
//   next:   E2E_BYPASS_AUTH=1 GAME_TOKEN_SECRET=<same>
//           NEXT_PUBLIC_ROOM_WS_URL=ws://localhost:8787 bun dev --port 3100
// Run: E2E_BASE_URL=http://localhost:3100 \
//      PLAYWRIGHT_CHROME_PATH=/usr/bin/google-chrome \
//      bun x playwright test tests/realtime.spec.ts
// Documented skip without env: `SKIP_E2E=1 bun x playwright test tests/realtime.spec.ts`
import { test, expect, type Page } from "@playwright/test";

const base = process.env.E2E_BASE_URL ?? "http://localhost:3100";

test.skip(!!process.env.SKIP_E2E, "Documented skip: no dev server / worker available.");

function gameId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

async function joinGame(page: Page, id: string, role: "white" | "black") {
  await page.goto(`${base}/play/${id}?role=${role}`);
  await expect(page.getByTestId("board")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("presence-label")).toContainText(/live/i, {
    timeout: 20_000,
  });
}

async function whiteOpeningMove(whitePage: Page) {
  await whitePage.getByTestId("square-6-1").click();
  await expect(whitePage.getByTestId("dest-5-2")).toBeVisible({ timeout: 10_000 });
  await whitePage.getByTestId("square-5-2").click();
}

test.describe("2-client realtime sync", () => {
  test("P1 move appears on P2 board", async ({ browser }) => {
    const id = gameId("rt-move");
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    try {
      const p1 = await ctx1.newPage();
      const p2 = await ctx2.newPage();
      await joinGame(p1, id, "white");
      await joinGame(p2, id, "black");

      await whiteOpeningMove(p1);

      for (const p of [p1, p2]) {
        await expect(p.getByTestId("turn-label")).toContainText(/black/i, {
          timeout: 15_000,
        });
        await expect(p.getByTestId("piece-5-2")).toBeVisible({ timeout: 15_000 });
        await expect(p.getByTestId("piece-6-1")).toHaveCount(0, { timeout: 15_000 });
        await expect(p.getByTestId("presence-label")).toContainText(/v1/, {
          timeout: 15_000,
        });
      }
    } finally {
      await ctx1.close();
      await ctx2.close();
    }
  });

  test("P1 illegal move toasts and boards unchanged on both", async ({ browser }) => {
    const id = gameId("rt-illegal");
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    try {
      const p1 = await ctx1.newPage();
      const p2 = await ctx2.newPage();
      await joinGame(p1, id, "white");
      await joinGame(p2, id, "black");

      // Black piece on white's turn: illegal.
      await p1.getByTestId("square-3-0").click();
      await expect(p1.getByText(/illegal/i).first()).toBeVisible({ timeout: 10_000 });

      for (const p of [p1, p2]) {
        await expect(p.getByTestId("turn-label")).toContainText(/white/i, {
          timeout: 15_000,
        });
        await expect(p.getByTestId("piece-3-0")).toBeVisible({ timeout: 15_000 });
        await expect(p.getByTestId("piece-5-2")).toHaveCount(0);
        await expect(p.getByTestId("presence-label")).toContainText(/v0/, {
          timeout: 15_000,
        });
      }
    } finally {
      await ctx1.close();
      await ctx2.close();
    }
  });

  test("P2 reload resyncs same position and version", async ({ browser }) => {
    const id = gameId("rt-reload");
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    try {
      const p1 = await ctx1.newPage();
      const p2 = await ctx2.newPage();
      await joinGame(p1, id, "white");
      await joinGame(p2, id, "black");

      await whiteOpeningMove(p1);
      await expect(p2.getByTestId("piece-5-2")).toBeVisible({ timeout: 15_000 });
      await expect(p2.getByTestId("presence-label")).toContainText(/v1/, {
        timeout: 15_000,
      });

      await p2.reload();
      await expect(p2.getByTestId("board")).toBeVisible({ timeout: 20_000 });
      await expect(p2.getByTestId("turn-label")).toContainText(/black/i, {
        timeout: 15_000,
      });
      await expect(p2.getByTestId("piece-5-2")).toBeVisible({ timeout: 15_000 });
      await expect(p2.getByTestId("piece-6-1")).toHaveCount(0);
      // Version history preserved across reload (authoritative resync).
      await expect(p2.getByTestId("presence-label")).toContainText(/v1/, {
        timeout: 15_000,
      });
    } finally {
      await ctx1.close();
      await ctx2.close();
    }
  });

  test("presence shows opponent online on both", async ({ browser }) => {
    const id = gameId("rt-presence");
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    try {
      const p1 = await ctx1.newPage();
      const p2 = await ctx2.newPage();
      await joinGame(p1, id, "white");
      await joinGame(p2, id, "black");

      await expect(p1.getByTestId("presence-label")).toContainText(/you play white/i, {
        timeout: 15_000,
      });
      await expect(p2.getByTestId("presence-label")).toContainText(/you play black/i, {
        timeout: 15_000,
      });
      await expect(p1.getByTestId("presence-label")).toContainText(/opponent online/i, {
        timeout: 15_000,
      });
      await expect(p2.getByTestId("presence-label")).toContainText(/opponent online/i, {
        timeout: 15_000,
      });
    } finally {
      await ctx1.close();
      await ctx2.close();
    }
  });
});
