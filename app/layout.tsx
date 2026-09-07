import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { Shell } from "@/components/dame/Shell";
import type { ReactNode } from "react";

export const metadata = { title: "Dame — Chess.com for checkers", description: "Live international checkers, ratings, voice." };

export default function RootLayout({ children }: { children: ReactNode }) {
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
