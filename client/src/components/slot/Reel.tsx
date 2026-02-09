import type { ReelId } from "../../../../shared/types";

interface ReelProps {
  reelId: ReelId;
  symbols: readonly string[];
  direction: "up_to_down" | "down_to_up";
  activeIndex: number;
  isSpinning: boolean;
}

function normalizeIndex(index: number, size: number): number {
  return ((index % size) + size) % size;
}

export default function Reel({ reelId, symbols, direction, activeIndex, isSpinning }: ReelProps) {
  const size = symbols.length;
  const currentIndex = normalizeIndex(activeIndex, size);
  const prevIndex = normalizeIndex(currentIndex - 1, size);
  const nextIndex = normalizeIndex(currentIndex + 1, size);

  return (
    <article className="reel-card">
      <p className="reel-title">Reel {reelId}</p>
      <div className="reel-window">
        <div className={`reel-stack ${isSpinning ? "spinning" : ""} ${direction === "up_to_down" ? "down" : "up"}`}>
          <div className="reel-item muted">{symbols[prevIndex]}</div>
          <div className="reel-item current">{symbols[currentIndex]}</div>
          <div className="reel-item muted">{symbols[nextIndex]}</div>
        </div>
        <div className="reel-center-line" />
      </div>
    </article>
  );
}
