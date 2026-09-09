// Presence core: online window + last-seen checks.
// Pure except Date; persistence behind PresenceStore so unit tests use an
// in-memory map and routes adapt Drizzle to it.

/** Online = last heartbeat within the last 5 minutes. */
export const ONLINE_WINDOW_MS = 5 * 60 * 1000;

export interface PresenceStore {
  getLastSeen(clerkIds: string[]): Promise<Map<string, Date>>;
  touch(clerkId: string, now: Date): Promise<void>;
}

export function isOnline(
  lastSeen: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!lastSeen || !(lastSeen instanceof Date) || Number.isNaN(lastSeen.getTime())) {
    return false;
  }
  return now.getTime() - lastSeen.getTime() < ONLINE_WINDOW_MS;
}
