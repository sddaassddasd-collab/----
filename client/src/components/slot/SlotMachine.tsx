import { useEffect, useMemo, useState } from "react";
import type { ClientState, GameMode, ReelId, StopIndex } from "../../../../shared/types";
import Reel from "./Reel";

interface ReelConfig {
  reelId: ReelId;
  direction: "up_to_down" | "down_to_up";
  symbols: readonly string[];
}

const REEL_CONFIG = [
  { reelId: 1, direction: "up_to_down", symbols: ["複", "復", "附", "負", "腹"] },
  { reelId: 2, direction: "down_to_up", symbols: ["象", "向", "像", "相", "項"] },
  { reelId: 3, direction: "up_to_down", symbols: ["公", "工", "攻", "功", "恭"] },
  { reelId: 4, direction: "down_to_up", symbols: ["場", "廠", "昶", "敞", "厂"] }
] satisfies ReadonlyArray<ReelConfig>;

interface SlotMachineProps {
  mode: GameMode;
  state: ClientState | null;
  isConnected: boolean;
  pendingPull: boolean;
  waitingStop: boolean;
  resultText: string;
  finishedAtText: string;
  rankText: string;
  onPull: () => void;
  onStopReel: (payload: { reelId: ReelId; stopIndex: StopIndex }) => void;
  onReset: () => void;
}

function normalize(index: number, size: number): number {
  return ((index % size) + size) % size;
}

function toStopIndex(value: number): StopIndex {
  return normalize(value, 5) as StopIndex;
}

function nextStopFromReels(reels: readonly string[]): ReelId | null {
  for (let index = 0; index < reels.length; index += 1) {
    if (reels[index] === "-") {
      return (index + 1) as ReelId;
    }
  }
  return null;
}

export default function SlotMachine({
  mode,
  state,
  isConnected,
  pendingPull,
  waitingStop,
  resultText,
  finishedAtText,
  rankText,
  onPull,
  onStopReel,
  onReset
}: SlotMachineProps) {
  const [indices, setIndices] = useState<[number, number, number, number]>([0, 0, 0, 0]);

  const phase = state?.phase ?? "ready";
  const reels = state?.reels ?? ["-", "-", "-", "-"];

  const nextStopReel = useMemo(() => {
    if (phase !== "spinning") {
      return null;
    }
    return nextStopFromReels(reels);
  }, [phase, reels]);

  useEffect(() => {
    if (!state) {
      setIndices([0, 0, 0, 0]);
      return;
    }

    setIndices((prev) => {
      const target = state.finalReels ?? state.reels;
      const next = [...prev] as [number, number, number, number];

      for (let index = 0; index < 4; index += 1) {
        const symbol = target[index];
        if (!symbol || symbol === "-") {
          continue;
        }

        const symbolIndex = REEL_CONFIG[index].symbols.indexOf(symbol);
        if (symbolIndex >= 0) {
          next[index] = symbolIndex;
        }
      }

      return next;
    });
  }, [state?.reels, state?.finalReels, state?.phase]);

  useEffect(() => {
    if (phase !== "spinning") {
      return;
    }

    const timer = window.setInterval(() => {
      setIndices((prev) => {
        const next = [...prev] as [number, number, number, number];

        for (let index = 0; index < 4; index += 1) {
          if (reels[index] !== "-") {
            continue;
          }

          const direction = REEL_CONFIG[index].direction;
          const step = direction === "up_to_down" ? 1 : -1;
          next[index] = normalize(next[index] + step, REEL_CONFIG[index].symbols.length);
        }

        return next;
      });
    }, 70);

    return () => window.clearInterval(timer);
  }, [phase, reels]);

  const canPull = Boolean(mode === "practice" && isConnected && phase === "ready" && !pendingPull && !waitingStop);
  const canStop = Boolean(isConnected && phase === "spinning" && nextStopReel && !pendingPull && !waitingStop);
  const canReset = Boolean(isConnected && phase !== "spinning" && !pendingPull && !waitingStop && mode === "practice");
  const pullButtonText = mode === "official" && phase === "ready" ? "等待後台開始" : pendingPull ? "啟動中..." : "Pull";

  const stopButtonText = (() => {
    if (phase === "spinning" && pendingPull) {
      return "啟動中...";
    }

    if (phase === "spinning" && waitingStop && nextStopReel) {
      return `停止第 ${nextStopReel} 欄...`;
    }

    if (phase === "spinning" && nextStopReel) {
      return `停止第 ${nextStopReel} 欄`;
    }

    if (phase === "spinning") {
      return "停止完成";
    }

    return "停止";
  })();

  return (
    <section className="slot-panel">
      <div className="reel-grid">
        {REEL_CONFIG.map((reel, index) => {
          const isSpinning = phase === "spinning" && reels[index] === "-";

          return (
            <Reel
              key={reel.reelId}
              reelId={reel.reelId}
              symbols={reel.symbols}
              direction={reel.direction}
              activeIndex={indices[index]}
              isSpinning={isSpinning}
            />
          );
        })}
      </div>

      <div className="action-row">
        <button type="button" className="primary-btn" disabled={!canPull} onClick={onPull}>
          {pullButtonText}
        </button>

        <button
          type="button"
          className="stop-btn"
          disabled={!canStop}
          onClick={() => {
            if (!nextStopReel) {
              return;
            }
            onStopReel({
              reelId: nextStopReel,
              stopIndex: toStopIndex(indices[nextStopReel - 1])
            });
          }}
        >
          {stopButtonText}
        </button>

        <button type="button" className="secondary-btn" disabled={!canReset} onClick={onReset}>
          Reset
        </button>
      </div>

      <p className="result-line">{resultText}</p>
      <div className="result-meta">
        <p className="result-meta-line">{finishedAtText}</p>
        <p className="result-meta-line">{rankText}</p>
      </div>
    </section>
  );
}
