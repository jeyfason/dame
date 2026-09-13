"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Play, Trophy, User } from "lucide-react";
import { UserBadge } from "./UserBadge";
import { Wordmark } from "./Wordmark";

const NAV_LINKS = [
  { href: "/play", label: "Play", icon: Play },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
] as const;

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Sticky top nav (desktop) — wordmark, sections, user badge. */
export function NavBar({ profileHref }: { profileHref: string }) {
  const pathname = usePathname() ?? "";
  return (
    <header className="sticky top-0 z-40 border-b border-[rgba(242,237,227,0.08)] bg-[color-mix(in_srgb,var(--dame-felt-deep)_88%,transparent)] backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <div className="flex items-center gap-8">
          <Wordmark />
          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                aria-current={isActive(pathname, href) ? "page" : undefined}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-colors duration-150 ${
                  isActive(pathname, href)
                    ? "bg-[rgba(201,162,39,0.15)] text-[var(--dame-accent-hi)]"
                    : "text-[var(--dame-muted)] hover:bg-[rgba(242,237,227,0.06)] hover:text-[var(--dame-text)]"
                }`}
              >
                {label}
              </Link>
            ))}
            <Link
              href={profileHref}
              aria-current={pathname.startsWith("/profile") ? "page" : undefined}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors duration-150 ${
                pathname.startsWith("/profile")
                  ? "bg-[rgba(201,162,39,0.15)] text-[var(--dame-accent-hi)]"
                  : "text-[var(--dame-muted)] hover:bg-[rgba(242,237,227,0.06)] hover:text-[var(--dame-text)]"
              }`}
            >
              Profile
            </Link>
          </nav>
        </div>
        <UserBadge />
      </div>
    </header>
  );
}

/** Mobile bottom tab bar — Play / Leaderboard / Profile. */
export function MobileTabs({ profileHref }: { profileHref: string }) {
  const pathname = usePathname() ?? "";
  const tabs = [
    { href: "/play", label: "Play", icon: Play },
    { href: "/leaderboard", label: "Ladder", icon: Trophy },
    { href: profileHref, label: "Profile", icon: User },
  ] as const;
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[rgba(242,237,227,0.08)] bg-[color-mix(in_srgb,var(--dame-felt-deep)_92%,transparent)] pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
    >
      <div className="grid grid-cols-3">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={label}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-[56px] flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
                active
                  ? "text-[var(--dame-accent-hi)]"
                  : "text-[var(--dame-muted)]"
              }`}
            >
              <Icon size={20} strokeWidth={active ? 2.2 : 1.8} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
