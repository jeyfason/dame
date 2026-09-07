import { EmptyBoard } from "@/components/dame/EmptyBoard";

export default function Play() {
  return (
    <div className="grid gap-6 py-8">
      <h2 className="text-2xl font-bold">Play</h2>
      <EmptyBoard />
      <p className="text-sm opacity-70">Rules engine lands in Stage 2. Auth gate verified by middleware.</p>
    </div>
  );
}
