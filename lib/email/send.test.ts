import { describe, it, expect } from "vitest";
import { sendInviteEmail, sendResultEmail } from "./send";

describe("lib/email/send best-effort", () => {
  it("skips without throwing when RESEND_API_KEY is missing", async () => {
    await expect(
      sendInviteEmail({
        to: "guest@example.com",
        hostName: "Ada",
        code: "ABCDEFGH",
        inviteUrl: "https://dame.gg/join?code=ABCDEFGH",
      }),
    ).resolves.toEqual({ skipped: true });
    await expect(
      sendResultEmail({
        to: "guest@example.com",
        gameId: "11111111-1111-4111-8111-111111111111",
        winner: "draw",
        whiteName: "Ada",
        blackName: "Bob",
        whiteDelta: 0,
        blackDelta: 0,
        rematchUrl: "https://dame.gg/",
      }),
    ).resolves.toEqual({ skipped: true });
  });

  it("skips without throwing when there is no recipient", async () => {
    await expect(
      sendInviteEmail({
        hostName: "Ada",
        code: "ABCDEFGH",
        inviteUrl: "https://dame.gg/join?code=ABCDEFGH",
      }),
    ).resolves.toEqual({ skipped: true });
  });
});
