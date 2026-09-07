import { UserButton } from "@clerk/nextjs";

export function UserBadge() {
  // Playwright-only stub for local dev/test without ClerkProvider.
  // Active solely when key missing and NODE_ENV!=="production".
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.NODE_ENV !== "production") {
    return (
      <span data-testid="user-badge-stub" className="text-sm opacity-70">
        Signed out
      </span>
    );
  }
  return <UserButton />;
}
