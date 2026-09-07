import Link from "next/link";
import { EmptyBoard } from "@/components/dame/EmptyBoard";

export default function Home() {
  return (
    <div className="grid gap-10 py-10 md:grid-cols-2 md:items-center">
      <div>
        <h1 className="text-4xl font-extrabold tracking-tight md:text-5xl">Chess.com, but for checkers.</h1>
        <p className="mt-4 text-lg opacity-80">Sign up and be in a live match in under 60 seconds. Rated ladder, friends, voice.</p>
        <div className="mt-6 flex gap-3">
          <Link href="/sign-up" className="rounded-[var(--dame-radius)] bg-[var(--dame-gold)] px-5 py-3 font-semibold text-black">Play now</Link>
          <Link href="/play" className="rounded-[var(--dame-radius)] border border-white/20 px-5 py-3">Quick match</Link>
        </div>
      </div>
      <EmptyBoard />
    </div>
  );
}
