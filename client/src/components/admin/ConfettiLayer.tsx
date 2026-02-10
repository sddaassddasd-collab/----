import { useEffect, useRef, useState } from "react";

interface ConfettiLayerProps {
  burstCount: number;
}

interface ConfettiPiece {
  id: string;
  left: number;
  color: string;
  durationMs: number;
  delayMs: number;
  size: number;
  rotateDeg: number;
}

const COLORS = ["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#eab308"];

function createBurst(): ConfettiPiece[] {
  const burstId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return Array.from({ length: 72 }, (_, index) => {
    const color = COLORS[Math.floor(Math.random() * COLORS.length)] ?? COLORS[0];
    return {
      id: `${burstId}-${index}`,
      left: Math.random() * 100,
      color,
      durationMs: 1800 + Math.floor(Math.random() * 1700),
      delayMs: Math.floor(Math.random() * 120),
      size: 7 + Math.floor(Math.random() * 5),
      rotateDeg: Math.floor(Math.random() * 360)
    };
  });
}

export default function ConfettiLayer({ burstCount }: ConfettiLayerProps) {
  const [pieces, setPieces] = useState<ConfettiPiece[]>([]);
  const lastBurstRef = useRef(0);

  useEffect(() => {
    if (burstCount <= lastBurstRef.current) {
      return;
    }

    const missingBursts = burstCount - lastBurstRef.current;
    lastBurstRef.current = burstCount;

    for (let burstNo = 0; burstNo < missingBursts; burstNo += 1) {
      const burst = createBurst();
      const burstIds = new Set(burst.map((piece) => piece.id));
      setPieces((prev) => [...prev, ...burst]);

      window.setTimeout(() => {
        setPieces((prev) => prev.filter((piece) => !burstIds.has(piece.id)));
      }, 4200);
    }
  }, [burstCount]);

  return (
    <div className="admin-confetti-layer" aria-hidden="true">
      {pieces.map((piece) => (
        <span
          key={piece.id}
          className="admin-confetti-piece"
          style={{
            left: `${piece.left}%`,
            backgroundColor: piece.color,
            width: `${piece.size}px`,
            height: `${Math.round(piece.size * 1.7)}px`,
            transform: `rotate(${piece.rotateDeg}deg)`,
            animationDuration: `${piece.durationMs}ms`,
            animationDelay: `${piece.delayMs}ms`
          }}
        />
      ))}
    </div>
  );
}
