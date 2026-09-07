import { UserButton } from "@clerk/nextjs";

export function UserBadge() {
  // Keyless dev / E2E (non-production only, no ClerkProvider): render a stub
  // instead of crashing. Production without a key uses UserButton and fails closed.
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.NODE_ENV !== "production") {
    return (
      <span data-testid="user-badge-stub" className="text-sm opacity-70">
        Signed out
      </span>
    );
  }
  return <UserButton />;
}
