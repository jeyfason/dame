// @vitest-environment node
import { describe, it, expect } from "vitest";
import { handleHeartbeat } from "./route";

function req(): Request {
  return new Request("http://localhost/api/presence", { method: "POST" });
}

describe("api/presence heartbeat", () => {
  it("200 ok on touch success", async () => {
    const res = await handleHeartbeat(req(), {
      touch: async () => {},
      clerkAuth: async () => "user_a",
      now: () => new Date("2026-09-09T12:00:00Z"),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });

  it("401 when unauthenticated", async () => {
    const res = await handleHeartbeat(req(), {
      touch: async () => {},
      clerkAuth: async () => null,
    });
    expect(res.status).toBe(401);
  });

  it("DB throw still 200 ok:true (never 500)", async () => {
    const res = await handleHeartbeat(req(), {
      touch: async () => {
        throw new Error("db down");
      },
      clerkAuth: async () => "user_a",
      now: () => new Date("2026-09-09T12:00:00Z"),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });
});
