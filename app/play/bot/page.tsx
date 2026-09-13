import type { Metadata } from "next";
import { BotBoard } from "@/components/dame/BotBoard";

export const metadata: Metadata = {
  title: "Play the bot — Dame",
  description: "Challenge the Dame bot at three difficulty levels, right in your browser.",
};

export default function PlayBot() {
  return (
    <div
      className="grid justify-items-center py-2"
      style={{ maxWidth: "min(600px, max(340px, calc(100dvh - 380px)))", margin: "0 auto" }}
    >
      <h1 className="sr-only">Play the bot</h1>
      <BotBoard />
    </div>
  );
}
