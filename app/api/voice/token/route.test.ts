import { describe, it, expect } from "vitest";
import { POST, GET, handleVoiceToken } from "./route";

describe("api/voice/token", () => {
  it("POST → 503 voice-disabled when the voice flag is off", async () => {
    const res = await handleVoiceToken(
      new Request("http://localhost/api/voice/token", { method: "POST" }),
      {
        voiceEnabled: async () => false,
        livekitEnv: () => ({ key: "k", secret: "s", url: "wss://x" }),
      },
    );
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ error: "voice-disabled" });
  });

  it("POST → 503 voice-disabled when LiveKit keys are missing", async () => {
    const res = await handleVoiceToken(
      new Request("http://localhost/api/voice/token", { method: "POST" }),
      {
        voiceEnabled: async () => true,
        livekitEnv: () => ({ key: undefined, secret: undefined, url: undefined }),
      },
    );
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ error: "voice-disabled" });
  });

  it("POST → stub token when flag on AND keys present", async () => {
    const res = await handleVoiceToken(
      new Request("http://localhost/api/voice/token", { method: "POST" }),
      {
        voiceEnabled: async () => true,
        livekitEnv: () => ({ key: "k", secret: "s", url: "wss://x" }),
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(typeof body.token).toBe("string");
  });

  it("route POST is 503 in this env (flag off, no LiveKit keys)", async () => {
    const res = await POST(
      new Request("http://localhost/api/voice/token", { method: "POST" }),
    );
    expect(res.status).toBe(503);
  });

  it("route GET is 503 in this env (flag off, no LiveKit keys)", async () => {
    const res = await GET(new Request("http://localhost/api/voice/token"));
    expect(res.status).toBe(503);
  });
});
