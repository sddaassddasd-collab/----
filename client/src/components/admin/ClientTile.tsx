import { useEffect, useMemo, useState } from "react";
import type { ClientState, GameMode, ReelId } from "../../../../shared/types";

interface ClientTileProps {
  socketId: string;
  state: ClientState;
  mode: GameMode;
  onResetOne: (socketId: string) => void;
}

interface MiniReelConfig {
  reelId: ReelId;
  direction: "up_to_down" | "down_to_up";
  symbols: readonly string[];
}

const MINI_REELS = [
  { reelId: 1, direction: "up_to_down", symbols: ["複", "復", "附", "負", "腹"] },
  { reelId: 2, direction: "down_to_up", symbols: ["象", "向", "像", "相", "項"] },
  { reelId: 3, direction: "up_to_down", symbols: ["公", "工", "攻", "功", "恭"] },
  { reelId: 4, direction: "down_to_up", symbols: ["場", "廠", "昶", "敞", "厂"] }
] satisfies ReadonlyArray<MiniReelConfig>;

function normalize(index: number, size: number): number {
  return ((index % size) + size) % size;
}

function phaseText(phase: ClientState["phase"]): string {
  if (phase === "ready") {
    return "待機";
  }
  if (phase === "spinning") {
    return "轉動中";
  }
  return "鎖定";
}

function phaseMessage(state: ClientState): string {
  if (state.phase === "locked") {
    return state.isWin ? "恭喜中獎，等待後台 reset" : "未中獎，等待後台 reset";
  }
  if (state.phase === "spinning") {
    return "進行中";
  }
  if (state.isWin) {
    return "中獎";
  }
  return "";
}

export default function ClientTile({ socketId, state, mode, onResetOne }: ClientTileProps) {
  const [indices, setIndices] = useState<[number, number, number, number]>([0, 0, 0, 0]);

  useEffect(() => {
    setIndices((prev) => {
      const next = [...prev] as [number, number, number, number];
      const target = state.finalReels ?? state.reels;

      for (let index = 0; index < 4; index += 1) {
        const symbol = target[index];
        if (!symbol || symbol === "-") {
          continue;
        }

        const symbolIndex = MINI_REELS[index].symbols.indexOf(symbol);
        if (symbolIndex >= 0) {
          next[index] = symbolIndex;
        }
      }

      return next;
    });
  }, [state.reels, state.finalReels, state.phase]);

  useEffect(() => {
    if (state.phase !== "spinning") {
      return;
    }

    const timer = window.setInterval(() => {
      setIndices((prev) => {
        const next = [...prev] as [number, number, number, number];

        for (let index = 0; index < 4; index += 1) {
          if (state.reels[index] !== "-") {
            continue;
          }

          const direction = MINI_REELS[index].direction;
          const step = direction === "up_to_down" ? 1 : -1;
          next[index] = normalize(next[index] + step, MINI_REELS[index].symbols.length);
        }

        return next;
      });
    }, 80);

    return () => window.clearInterval(timer);
  }, [state.phase, state.reels]);

  const displaySymbols = useMemo(() => {
    const target = state.finalReels ?? state.reels;
    return target.map((symbol, index) => {
      if (symbol !== "-") {
        return symbol;
      }
      return MINI_REELS[index].symbols[indices[index]];
    });
  }, [state.reels, state.finalReels, indices]);

  return (
    <article className={`admin-client-tile ${state.isWin ? "winner" : ""}`}>
      <div className="admin-client-top">
        <div>
          <p className="admin-client-name">{state.name}</p>
          <p className="admin-client-id">ID {socketId.slice(0, 8)}</p>
        </div>
        <span className={`admin-phase-badge ${state.phase}`}>{phaseText(state.phase)}</span>
      </div>

      <div className="admin-mini-slot">
        {MINI_REELS.map((reel, index) => {
          const currentSymbol = displaySymbols[index];
          const currentIndex = reel.symbols.indexOf(currentSymbol);
          const fallbackIndex = indices[index];
          const centerIndex = currentIndex >= 0 ? currentIndex : fallbackIndex;
          const prevIndex = normalize(centerIndex - 1, reel.symbols.length);
          const nextIndex = normalize(centerIndex + 1, reel.symbols.length);
          const spinning = state.phase === "spinning" && state.reels[index] === "-";

          return (
            <div key={reel.reelId} className="admin-mini-reel">
              <div
                className={`admin-mini-stack ${spinning ? "spinning" : ""} ${
                  reel.direction === "up_to_down" ? "down" : "up"
                }`}
              >
                <div className="admin-mini-item muted">{reel.symbols[prevIndex]}</div>
                <div className="admin-mini-item current">{reel.symbols[centerIndex]}</div>
                <div className="admin-mini-item muted">{reel.symbols[nextIndex]}</div>
              </div>
              <div className="admin-mini-center-line" />
            </div>
          );
        })}
      </div>

      <p className="admin-client-message">{phaseMessage(state)}</p>

      <button type="button" className="admin-reset-one-btn" disabled={mode !== "official"} onClick={() => onResetOne(socketId)}>
        Reset 此人
      </button>
    </article>
  );
}
