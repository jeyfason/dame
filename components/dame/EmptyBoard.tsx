/** Static premium board for decorative use (espresso frame, maple/walnut squares). */
export function EmptyBoard() {
  return (
    <div
      aria-label="10 by 10 checkers board placeholder"
      className="dame-board-frame w-full max-w-[560px] p-2.5 sm:p-3"
    >
      <div className="grid aspect-square w-full grid-cols-10 overflow-hidden rounded-[10px] shadow-[inset_0_2px_8px_rgba(0,0,0,0.55)]">
        {Array.from({ length: 100 }).map((_, i) => {
          const r = Math.floor(i / 10);
          const c = i % 10;
          const dark = (r + c) % 2 === 1;
          return <div key={i} className={dark ? "dame-square-dark" : "dame-square-light"} />;
        })}
      </div>
    </div>
  );
}
