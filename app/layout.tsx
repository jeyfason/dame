import "./globals.css";
import { Fraunces, Outfit } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Shell } from "@/components/dame/Shell";
import type { Metadata } from "next";
import type { ReactNode } from "react";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Dame — Classic checkers, played live",
  description:
    "Live rated international checkers. Invite a friend, climb the ladder, play beautiful.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  // Playwright-only keyless render for local dev/test without Clerk keys.
  // Active solely when key missing and NODE_ENV!=="production".
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.NODE_ENV !== "production") {
    return (
      <html lang="en" className={`${outfit.variable} ${fraunces.variable}`}>
        <body>
          <Shell>{children}</Shell>
        </body>
      </html>
    );
  }
  return (
    <ClerkProvider>
      <html lang="en" className={`${outfit.variable} ${fraunces.variable}`}>
        <body>
          <Shell>{children}</Shell>
        </body>
      </html>
    </ClerkProvider>
  );
}
