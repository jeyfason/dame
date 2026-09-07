import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { Shell } from "@/components/dame/Shell";
import type { ReactNode } from "react";

export const metadata = { title: "Dame — Chess.com for checkers", description: "Live international checkers, ratings, voice." };

export default function RootLayout({ children }: { children: ReactNode }) {
  // Local Playwright E2E / keyless dev (non-production only): render without
  // Clerk so pages work without publishable keys. Production without a key
  // falls through to ClerkProvider and fails closed.
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.NODE_ENV !== "production") {
    return (
      <html lang="en">
        <body>
          <Shell>{children}</Shell>
        </body>
      </html>
    );
  }
  return (
    <ClerkProvider>
      <html lang="en">
        <body>
          <Shell>{children}</Shell>
        </body>
      </html>
    </ClerkProvider>
  );
}
