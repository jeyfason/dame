import Link from "next/link";
import { LocalBoard } from "@/components/dame/LocalBoard";
import { Toaster } from "@/components/ui/sonner";

export default function Play() {
  return (
    <div className="grid gap-6 py-8">
      <h2 className="text-2xl font-bold">Play</h2>
      <div className="flex flex-wrap gap-3">
        <Link
          href="/play/join"
          className="rounded-[var(--dame-radius)] bg-[var(--dame-gold)] px-5 py-3 font-semibold text-black"
        >
          Play a friend online
        </Link>
        <Link
          href="/leaderboard"
          className="rounded-[var(--dame-radius)] border border-white/20 px-5 py-3"
        >
          Leaderboard
        </Link>
      </div>
      <p className="text-sm opacity-70">Local 2-player. White moves first.</p>
      <LocalBoard />
      <Toaster />
    </div>
  );
}
