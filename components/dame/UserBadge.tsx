import { UserButton } from "@clerk/nextjs";

export function UserBadge() {
  // Keyless dev / E2E (no ClerkProvider): render a stub instead of crashing.
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return (
      <span data-testid="user-badge-stub" className="text-sm opacity-70">
        Signed out
      </span>
    );
  }
  return <UserButton />;
}
