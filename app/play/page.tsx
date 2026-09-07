import { LocalBoard } from "@/components/dame/LocalBoard";
import { Toaster } from "@/components/ui/sonner";

export default function Play() {
  return (
    <div className="grid gap-6 py-8">
      <h2 className="text-2xl font-bold">Play</h2>
      <p className="text-sm opacity-70">Local 2-player. White moves first.</p>
      <LocalBoard />
      <Toaster />
    </div>
  );
}
