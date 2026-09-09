import { describe, it, expect } from "vitest";
import { buildStatus } from "../app/api/status/route";
import { isSentryTestAllowed } from "../app/api/sentry-test/route";

describe("status shape", () => {
  it("returns db/worker/version JSON", async () => {
    const s = await buildStatus({
      pingDb: async () => ({ ok: true, latencyMs: 1 }),
      pingWorker: async () => ({ ok: true }),
      getVersion: () => "0.1.0",
      getRelease: () => "test-release",
    });
    expect(s.db.ok).toBe(true);
    expect(s.worker.ok).toBe(true);
    expect(typeof s.version).toBe("string");
    expect(typeof s.release).toBe("string");
    expect(typeof s.ok).toBe("boolean");
  });
});

describe("sentry-test dev gate", () => {
  it("fail-closed in production", () => {
    expect(isSentryTestAllowed("production")).toBe(false);
  });
  it("allowed outside production", () => {
    expect(isSentryTestAllowed("development")).toBe(true);
  });
});
