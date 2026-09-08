// Dame Stage 4 Task 4 — Invite flow E2E (Playwright).
//
// Host mints invite -> guest joins same board via code -> move syncs ->
// finish persists (mocked, no live DB) -> leaderboard lists both (mocked
// document) -> rematch loads new game swapped.
//
// Requires linked local stack (same as realtime.spec.ts):
//   worker: GAME_TOKEN_SECRET=<same> bunx wrangler dev --port 8787   (worker/)
//   next:   E2E_BYPASS_AUTH=1 GAME_TOKEN_SECRET=<same>
//           NEXT_PUBLIC_ROOM_WS_URL=ws://localhost:8787 bun dev --port 3100
// Run: E2E_BASE_URL=http://localhost:3100 \
//      PLAYWRIGHT_CHROME_PATH=/usr/bin/google-chrome \
//      bun x playwright test tests/invites.spec.ts
// Documented skip without env: `SKIP_E2E=1 bun x playwright test tests/invites.spec.ts`
//
// Mocking rationale (no live DB in E2E):
// - POST /api/invites is Clerk-only by intent (fail-closed, no E2E bypass),
//   so the spec stubs mint/redeem at the network layer with a shared
//   in-test gameId. Prod auth is untouched.
// - POST /api/games/finish is stubbed to an ok rated result (white wins).
// - GET /leaderboard document is stubbed to HTML listing both players,
//   since the real page reads Neon directly.
// - /api/room + WS move sync + rematch game creation stay REAL (linked stack).
// TODO (live-DB follow-up): run this flow unmocked against a preview Neon
// branch (real Clerk sessions + real invites/finish/leaderboard reads) to
// cover the DB paths mocked here.
import { test, expect, type Page } from "@playwright/test";

const base = process.env.E2E_BASE_URL ?? "http://localhost:3100";

test.skip(!!process.env.SKIP_E2E, "Documented skip: no dev server / worker available.");

const INVITE_CODE = "ABCDEFGH";
const WHITE_CLERK = "e2e-host";
const BLACK_CLERK = "e2e-guest";

function gameId(): string {
  return crypto.randomUUID();
}

async function stubInvites(page: Page, sharedGameId: string) {
  await page.route("**/api/invites", async (route) => {
    const req = route.request();
    if (req.method() !== "POST") {
      await route.fallback();
      return;
    }
    let body: Record<string, unknown> = {};
    try {
      body = (JSON.parse(req.postData() ?? "{}") as Record<string, unknown>) ?? {};
    } catch {
      body = {};
    }
    if (typeof body["code"] === "string") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ code: INVITE_CODE, gameId: sharedGameId }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        code: INVITE_CODE,
        gameId: sharedGameId,
        expiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      }),
    });
  });
}

async function stubFinish(page: Page, sharedGameId: string) {
  await page.route("**/api/games/finish", async (route) => {
    const req = route.request();
    if (req.method() !== "POST") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        gameId: sharedGameId,
        winner: "white",
        duplicate: false,
        white: { clerkId: WHITE_CLERK, rating: 1516, rd: 200, vol: 0.06, gamesPlayed: 1 },
        black: { clerkId: BLACK_CLERK, rating: 1484, rd: 200, vol: 0.06, gamesPlayed: 1 },
      }),
    });
  });
}

function leaderboardHtml(): string {
  return `<!doctype html><html><body>
<h2>Leaderboard</h2>
<ol data-testid="leaderboard">
<li data-testid="leaderboard-row-1"><span>#1 ${WHITE_CLERK}</span><span>1516 · RD 200 · 1 games</span></li>
<li data-testid="leaderboard-row-2"><span>#2 ${BLACK_CLERK}</span><span>1484 · RD 200 · 1 games</span></li>
</ol>
</body></html>`;
}

async function joinAs(page: Page, id: string, role: "white" | "black") {
  await page.goto(`${base}/play/${id}?role=${role}`);
  await expect(page.getByTestId("board")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("presence-label")).toContainText(/live/i, {
    timeout: 20_000,
  });
}

test.describe("invite flow", () => {
  test("host mints -> guest joins same board -> move syncs -> finish -> leaderboard -> rematch swapped", async ({
    browser,
  }) => {
    const sharedId = gameId();

    const hostCtx = await browser.newContext();
    const guestCtx = await browser.newContext();
    try {
      const host = await hostCtx.newPage();
      const guest = await guestCtx.newPage();

      await stubInvites(host, sharedId);
      await stubInvites(guest, sharedId);
      await stubFinish(host, sharedId);
      await stubFinish(guest, sharedId);

      // 1. Host mints invite on /play/join.
      await host.goto(`${base}/play/join`);
      await host.getByTestId("create-invite").click();
      await expect(host.getByTestId("invite-code")).toContainText(INVITE_CODE, {
        timeout: 10_000,
      });
      await expect(host.getByTestId("invite-link")).toContainText(INVITE_CODE);

      // Host opens the game as White (real /api/room + WS).
      await host.getByTestId("open-as-white").click();
      await expect(host).toHaveURL(new RegExp(`/play/${sharedId}\\?role=white`), {
        timeout: 10_000,
      });
      await expect(host.getByTestId("board")).toBeVisible({ timeout: 20_000 });
      await expect(host.getByTestId("presence-label")).toContainText(/you play white/i, {
        timeout: 20_000,
      });

      // 2. Guest joins with the code -> same board as Black.
      await guest.goto(`${base}/play/join`);
      await guest.getByTestId("join-input").fill(INVITE_CODE);
      await guest.getByTestId("join-submit").click();
      await expect(guest).toHaveURL(new RegExp(`/play/${sharedId}\\?role=black`), {
        timeout: 10_000,
      });
      await expect(guest.getByTestId("board")).toBeVisible({ timeout: 20_000 });
      await expect(guest.getByTestId("presence-label")).toContainText(/you play black/i, {
        timeout: 20_000,
      });

      // 3. Move syncs: White opening 6,1 -> 5,2 appears on both at v1.
      await host.getByTestId("square-6-1").click();
      await expect(host.getByTestId("dest-5-2")).toBeVisible({ timeout: 10_000 });
      await host.getByTestId("square-5-2").click();
      for (const p of [host, guest]) {
        await expect(p.getByTestId("turn-label")).toContainText(/black/i, {
          timeout: 15_000,
        });
        await expect(p.getByTestId("piece-5-2")).toBeVisible({ timeout: 15_000 });
        await expect(p.getByTestId("piece-6-1")).toHaveCount(0, { timeout: 15_000 });
        await expect(p.getByTestId("presence-label")).toContainText(/v1/, {
          timeout: 15_000,
        });
      }

      // 4. Finish persists (mocked rated result, white wins).
      const finishRes = await host.evaluate(async ({ gameId: gid }) => {
        const res = await fetch("/api/games/finish", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            gameId: gid,
            whiteClerkId: "e2e-host",
            blackClerkId: "e2e-guest",
            winner: "white",
            reason: "win",
            moves: [],
          }),
        });
        return { status: res.status, json: (await res.json()) as unknown };
      }, { gameId: sharedId });
      expect(finishRes.status).toBe(200);
      const finishJson = finishRes.json as {
        ok: boolean;
        gameId: string;
        winner: string;
        white: { clerkId: string };
        black: { clerkId: string };
      };
      expect(finishJson.ok).toBe(true);
      expect(finishJson.gameId).toBe(sharedId);
      expect(finishJson.winner).toBe("white");
      expect(finishJson.white.clerkId).toBe(WHITE_CLERK);
      expect(finishJson.black.clerkId).toBe(BLACK_CLERK);

      // 5. Leaderboard lists both (mocked document, no live DB).
      await host.route("**/leaderboard", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "text/html",
          body: leaderboardHtml(),
        });
      });
      await host.goto(`${base}/leaderboard`);
      await expect(host.getByTestId("leaderboard")).toBeVisible({ timeout: 10_000 });
      await expect(host.getByTestId("leaderboard-row-1")).toContainText(WHITE_CLERK);
      await expect(host.getByTestId("leaderboard-row-2")).toContainText(BLACK_CLERK);

      // 6. Rematch loads a new game swapped (real /api/room creation).
      // Host was white -> rematch as black; guest was black -> rematch as white.
      const minted = await host.evaluate(async () => {
        const res = await fetch("/api/room", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        });
        if (!res.ok) return { ok: false, status: res.status };
        const data = (await res.json()) as { gameId?: string };
        return { ok: true, gameId: data.gameId ?? "" };
      });
      expect(minted.ok).toBe(true);
      const UUID_RE =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      expect(minted.gameId).toMatch(UUID_RE);
      const nextId = minted.gameId as string;
      expect(nextId).not.toBe(sharedId);

      await host.goto(`${base}/play/${nextId}?role=black`);
      await expect(host.getByTestId("board")).toBeVisible({ timeout: 20_000 });
      await expect(host.getByTestId("presence-label")).toContainText(/you play black/i, {
        timeout: 20_000,
      });
      await joinAs(guest, nextId, "white");
      await expect(guest.getByTestId("presence-label")).toContainText(/you play white/i, {
        timeout: 20_000,
      });
      for (const p of [host, guest]) {
        await expect(p.getByTestId("turn-label")).toContainText(/white/i, {
          timeout: 15_000,
        });
      }
    } finally {
      await hostCtx.close();
      await guestCtx.close();
    }
  });
});
