# Dame Stage 5 — Social Layer Design Spec

**Date:** 2026-09-07
**Status:** Approved sections 1-4
**Source:** PRD §6.5 + §8.2 + §8.5 + Stages 1-4 on main
**Approach:** A DO chat + friends + Resend now, LiveKit behind flag.

## Goal

Playing-together layer: live chat + emotes + typing, friends + presence, invite/result emails, voice path stubbed behind flag. No full voice yet.

## Non-goals

LiveKit audio join, paid tournaments, spectator rooms.

## Chat

- Frames: `chat {text|emote, at}`, `typing {on}` via GameRoom broadcast, last-50 memory, 500-char cap, 1/sec/socket limit, malformed → drop + count.
- UI: `ChatPanel` (list + input + emote chips `:gg: :wp: :oops: :nh:` + typing line), beside board desktop / tab mobile.
- Tests: worker unit (broadcast, cap, rate-limit, history replay on join), Playwright 2-client exchange + typing.

## Friends + Presence

- `friendships(requester_clerk_id, addressee_clerk_id, status, created_at, updated_at)` + ordered pair index + unordered LEAST/GREATEST index (`0005`, opposite-direction race → 409).
- `POST /api/friends {action: request|accept|decline|remove, userId}`, `GET /api/friends` with online (recent activity <5min from games/WS heartbeat table `presence(clerk_id, last_seen)` updated on join/move).
- `POST /api/presence` heartbeat is best-effort (DB failure → 200 ok:true + breadcrumb, never 500); `GET /api/room` + `POST /api/room` touch presence best-effort. `GET /api/invites?code=` is the read-only lookup (never consumes; POST redeems).
- Profile friend button; leaderboard `?scope=friends` filter (presence fetch best-effort → all-offline on failure).

## Email

- Resend + React Email templates: `InviteEmail` (host name, code link), `ResultEmail` (winner, deltas, rematch link). `GET /api/email/preview?template=invite|result` + `POST /api/email/preview` dev-only render. Send best-effort on invite + finish, `RESEND_API_KEY` env, fail-silent + Sentry breadcrumb; per-recipient throttle 5/hour in-memory; recipients @-validated; result names prefer `users.displayName` with clerkId-slice fallback.
- Constraints: no email PII beyond display name; unsubscribe note (transactional only).

## Voice flag path

- `GET /api/voice/token` + `POST /api/voice/token` → 503 `{error:"voice disabled"}` unless `voice` flag on AND `LIVEKIT_*` present; `VoiceBar` (join disabled state, mute toggle UI only). Full join + cost review tracked Stage 6.

## Testing

Vitest chat/friends/email-render, Playwright chat + friend + email-preview flows, suites green.

## Constraints

bun only; fail-closed; no secrets; token vars; 44px targets; keyboard + screen-reader labels on chat.

## Success

Chat live both ways, friends + online dots, emails render/send, voice 503-clean, gates green.
