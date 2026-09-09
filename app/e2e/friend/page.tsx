import { notFound } from "next/navigation";
import { FriendButton } from "@/components/dame/FriendButton";

// Playwright-only harness for the friend-request flow (Stage 5 Task 4).
// Renders the REAL FriendButton UI; the spec stubs GET/POST /api/friends
// at the network layer (prod auth untouched). Dev-only: 404 in production
// so this never ships a test surface.
export default function E2EFriendHarness() {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <div className="grid gap-6 py-8">
      <h2 data-testid="e2e-friend-title">Friend harness</h2>
      <FriendButton userId="user_b" />
    </div>
  );
}
