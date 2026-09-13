import type { ReactNode } from "react";
import { auth } from "@clerk/nextjs/server";
import { NavBar, MobileTabs } from "@/components/dame/NavBar";
import { PieceTextureSync } from "@/lib/piece-texture";

async function profileHref(): Promise<string> {
  // Presence of a signed-in user decides where "Profile" points; a missing
  // Clerk context (keyless dev/test) degrades to the sign-in page.
  try {
    const { userId } = await auth();
    return userId ? `/profile/${userId}` : "/sign-in";
  } catch {
    return "/sign-in";
  }
}

export async function Shell({ children }: { children: ReactNode }) {
  const href = await profileHref();
  return (
    <div className="min-h-dvh text-[var(--dame-text)]">
      <PieceTextureSync />
      <NavBar profileHref={href} />
      <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-6 md:pb-16">
        {children}
      </main>
      <MobileTabs profileHref={href} />
    </div>
  );
}
