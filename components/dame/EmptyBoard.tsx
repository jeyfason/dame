export function EmptyBoard() {
  return (
    <div
      aria-label="10 by 10 checkers board placeholder"
      className="grid aspect-square w-full max-w-[560px] grid-cols-10 overflow-hidden rounded-[var(--dame-radius)] border border-white/10"
      style={{ background: "var(--dame-felt)" }}
    >
      {Array.from({ length: 100 }).map((_, i) => {
        const r = Math.floor(i / 10);
        const c = i % 10;
        const dark = (r + c) % 2 === 1;
        return <div key={i} className={dark ? "bg-black/30" : "bg-white/10"} />;
      })}
    </div>
  );
}
