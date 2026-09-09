// Dame Stage 5 Task 4 — Social E2E (Playwright).
//
// Covers: 2-client chat exchange + typing (REAL WS), friend request flow
// (mocked friends API, REAL FriendButton UI), email preview renders both
// templates (REAL), VoiceBar disabled visible (REAL) + voice token 503 (REAL).
//
// Requires linked local stack (same as realtime.spec.ts):
//   worker: GAME_TOKEN_SECRET=<same> bunx wrangler dev --port 8787   (worker/)
//   next:   E2E_BYPASS_AUTH=1 GAME_TOKEN_SECRET=<same>
//           NEXT_PUBLIC_ROOM_WS_URL=ws://localhost:8787 bun dev --port 3100
// Run: E2E_BASE_URL=http://localhost:3100 \
//      PLAYWRIGHT_CHROME_PATH=/usr/bin/google-chrome \
//      bun x playwright test tests/social.spec.ts
// Documented skip without env: `SKIP_E2E=1 bun x playwright test tests/social.spec.ts`
//
// Mocking rationale (prod auth untouched):
// - /api/room + WS chat/typing stay REAL (linked stack).
// - GET/POST /api/friends is Clerk-only by intent (fail-closed, no E2E
//   bypass), so the spec stubs it at the network layer with an in-test state
//   machine mirroring the real route semantics (pending/accepted, 409
//   double-request, 403 stranger). The FriendButton UI is REAL via the
//   dev-only /e2e/friend harness (404 in production).
// - /api/voice/token + /api/email/preview stay REAL (no auth; voice flag off
//   without DB → 503; preview is dev-gated and dev runs NODE_ENV=development).
import { test, expect, type Page } from "@playwright/test";

const base = process.env.E2E_BASE_URL ?? "http://localhost:3100";

test.skip(!!process.env.SKIP_E2E, "Documented skip: no dev server / worker available.");

// gameId is UUIDv4 everywhere (Next /api/room + worker WS enforce it).
function gameId(): string {
  return crypto.randomUUID();
}

async function joinGame(page: Page, id: string, role: "white" | "black") {
  await page.goto(`${base}/play/${id}?role=${role}`);
  await expect(page.getByTestId("board")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("presence-label")).toContainText(/live/i, {
    timeout: 20_000,
  });
  await expect(page.getByTestId("chat-panel")).toBeVisible({ timeout: 10_000 });
}

type FriendState = "none" | "outgoing" | "incoming" | "friends";

// In-test friends API: mirrors app/api/friends/route.ts semantics
// (request→pending, accept/decline only incoming, remove only accepted,
// double-request 409, stranger 403). Network-layer stub only — prod auth
// and route code are untouched.
async function stubFriends(page: Page, ctrl: { state: FriendState }) {
  await page.route("**/api/friends", async (route) => {
    const req = route.request();
    if (req.method() === "GET") {
      const s = ctrl.state;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          friends: s === "friends" ? [{ userId: "user_b", online: true }] : [],
          incoming: s === "incoming" ? [{ userId: "user_b" }] : [],
          outgoing: s === "outgoing" ? [{ userId: "user_b" }] : [],
        }),
      });
      return;
    }
    if (req.method() === "POST") {
      let body: Record<string, unknown> = {};
      try {
        body = (JSON.parse(req.postData() ?? "{}") as Record<string, unknown>) ?? {};
      } catch {
        body = {};
      }
      const action = body["action"];
      const userId = body["userId"];
      if (userId !== "user_b") {
        // Stranger path: accept/decline/remove on an unknown relation → 403.
        if (action === "request") {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ ok: true, status: "pending" }),
          });
        } else {
          await route.fulfill({
            status: 403,
            contentType: "application/json",
            body: JSON.stringify({ error: "forbidden" }),
          });
        }
        return;
      }
      if (action === "request") {
        if (ctrl.state !== "none") {
          await route.fulfill({
            status: 409,
            contentType: "application/json",
            body: JSON.stringify({ error: "already requested or friends" }),
          });
        } else {
          ctrl.state = "outgoing";
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ ok: true, status: "pending" }),
          });
        }
        return;
      }
      if (action === "accept" || action === "decline") {
        if (ctrl.state !== "incoming") {
          await route.fulfill({
            status: 403,
            contentType: "application/json",
            body: JSON.stringify({ error: "forbidden" }),
          });
        } else {
          ctrl.state = action === "accept" ? "friends" : "none";
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              ok: true,
              status: action === "accept" ? "accepted" : "declined",
            }),
          });
        }
        return;
      }
      if (action === "remove") {
        if (ctrl.state !== "friends") {
          await route.fulfill({
            status: 403,
            contentType: "application/json",
            body: JSON.stringify({ error: "forbidden" }),
          });
        } else {
          ctrl.state = "none";
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ ok: true, removed: true }),
          });
        }
        return;
      }
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "bad action" }),
      });
      return;
    }
    await route.fallback();
  });
}

test.describe("social", () => {
  test("2-client chat exchange + typing indicator", async ({ browser }) => {
    const id = gameId();
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    try {
      const white = await ctx1.newPage();
      const black = await ctx2.newPage();
      await joinGame(white, id, "white");
      await joinGame(black, id, "black");

      // Typing: white drafts → black sees the indicator.
      await white.getByTestId("chat-input").pressSequentially("hey", { delay: 30 });
      await expect(black.getByTestId("chat-typing")).toContainText(/typing/i, {
        timeout: 10_000,
      });

      // White sends → both see it.
      await white.getByTestId("chat-input").fill("hello from white");
      await white.getByTestId("chat-send").click();
      for (const p of [white, black]) {
        await expect(p.getByTestId("chat-list")).toContainText("hello from white", {
          timeout: 15_000,
        });
      }

      // Black replies → both see it (per-socket rate limit, no wait needed).
      await black.getByTestId("chat-input").fill("hi white :wp:");
      await black.getByTestId("chat-send").click();
      for (const p of [white, black]) {
        await expect(p.getByTestId("chat-list")).toContainText("hi white :wp:", {
          timeout: 15_000,
        });
      }

      // Emote chip inserts into the draft (no send, no rate-limit touch).
      await white.getByTestId("emote-gg").click();
      await expect(white.getByTestId("chat-input")).toHaveValue(/:gg:/, {
        timeout: 10_000,
      });
    } finally {
      await ctx1.close();
      await ctx2.close();
    }
  });

  test("friend request flow (mocked API, real UI)", async ({ page }) => {
    const ctrl = { state: "none" as FriendState };
    await stubFriends(page, ctrl);

    await page.goto(`${base}/e2e/friend`);
    await expect(page.getByTestId("e2e-friend-title")).toBeVisible({ timeout: 10_000 });

    // Request: none → outgoing via the REAL FriendButton.
    await expect(page.getByTestId("friend-button")).toContainText(/add friend/i);
    await page.getByTestId("friend-button").click();
    await expect(page.getByTestId("friend-status")).toContainText(/request sent/i, {
      timeout: 10_000,
    });

    // Prod parity: double-request → 409.
    const dup = await page.evaluate(async () => {
      const r = await fetch("/api/friends", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "request", userId: "user_b" }),
      });
      return { status: r.status };
    });
    expect(dup.status).toBe(409);

    // Prod parity: stranger accept → 403.
    const stranger = await page.evaluate(async () => {
      const r = await fetch("/api/friends", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "accept", userId: "user_stranger" }),
      });
      return { status: r.status };
    });
    expect(stranger.status).toBe(403);

    // Accept: simulate user_b requesting me, then accept via REAL UI.
    ctrl.state = "incoming";
    await page.reload();
    await expect(page.getByTestId("friend-button")).toContainText(/accept/i, {
      timeout: 10_000,
    });
    await page.getByTestId("friend-button").click();
    await expect(page.getByTestId("friend-status")).toContainText(/friends/i, {
      timeout: 10_000,
    });
    await expect(page.getByTestId("friend-button")).toContainText(/remove/i);

    // List shows the friend online (presence parity).
    const list = await page.evaluate(async () => {
      const r = await fetch("/api/friends");
      return { status: r.status, json: (await r.json()) as unknown };
    });
    expect(list.status).toBe(200);
    expect((list.json as { friends: unknown }).friends).toEqual([
      { userId: "user_b", online: true },
    ]);

    // Remove: friends → none via the REAL UI.
    await page.getByTestId("friend-button").click();
    await expect(page.getByTestId("friend-button")).toContainText(/add friend/i, {
      timeout: 10_000,
    });
  });

  test("email preview renders invite + result templates", async ({ page }) => {
    await page.goto(base);
    const invite = await page.evaluate(async () => {
      const r = await fetch("/api/email/preview?template=invite");
      return { status: r.status, text: await r.text() };
    });
    expect(invite.status).toBe(200);
    expect(invite.text).toContain("ABCDEFGH");
    expect(invite.text).toContain("Join the game");

    const result = await page.evaluate(async () => {
      const r = await fetch("/api/email/preview?template=result");
      return { status: r.status, text: await r.text() };
    });
    expect(result.status).toBe(200);
    expect(result.text).toContain("Start a rematch");
    expect(result.text).toContain("+12.3");
  });

  test("VoiceBar disabled visible + voice token 503", async ({ page }) => {
    await joinGame(page, gameId(), "white");
    await expect(page.getByTestId("voice-bar")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("voice-bar")).toHaveAttribute("data-state", "disabled");
    await expect(page.getByTestId("voice-join")).toBeDisabled();
    await expect(page.getByTestId("voice-bar")).toContainText(/voice chat is off/i);

    const viaGet = await page.evaluate(async () => {
      const r = await fetch("/api/voice/token");
      return { status: r.status, json: (await r.json()) as unknown };
    });
    expect(viaGet.status).toBe(503);
    expect(viaGet.json).toEqual({ error: "voice-disabled" });

    const viaPost = await page.evaluate(async () => {
      const r = await fetch("/api/voice/token", { method: "POST" });
      return { status: r.status, json: (await r.json()) as unknown };
    });
    expect(viaPost.status).toBe(503);
    expect(viaPost.json).toEqual({ error: "voice-disabled" });
  });
});
