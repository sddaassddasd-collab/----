import { useEffect, useMemo, useState } from "react";
import type { ClientState, GameMode } from "../../../../shared/types";
import ClientTile from "./ClientTile";

export interface ClientEntry {
  socketId: string;
  state: ClientState;
  rank: number;
}

interface GridBoardProps {
  clients: ClientEntry[];
  mode: GameMode;
  onResetOne: (socketId: string) => void;
}

const MAX_COLS = 6;
const MAX_ROWS = 5;

export function chooseGridLayout(count: number, viewportAspect = 16 / 9): { rows: number; cols: number } {
  if (count <= 0) {
    return { rows: 1, cols: 1 };
  }

  let best = {
    rows: 1,
    cols: 1,
    score: Number.POSITIVE_INFINITY
  };

  for (let cols = 1; cols <= MAX_COLS; cols += 1) {
    const rows = Math.ceil(count / cols);
    if (rows > MAX_ROWS) {
      continue;
    }

    const empty = rows * cols - count;
    const aspectDiff = Math.abs(cols / rows - viewportAspect);
    const score = empty * 100 + aspectDiff;

    if (score < best.score) {
      best = { rows, cols, score };
    }
  }

  return { rows: best.rows, cols: best.cols };
}

export default function GridBoard({ clients, mode, onResetOne }: GridBoardProps) {
  const [aspect, setAspect] = useState(() => window.innerWidth / Math.max(window.innerHeight, 1));

  useEffect(() => {
    const handleResize = () => {
      setAspect(window.innerWidth / Math.max(window.innerHeight, 1));
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const { rows, cols } = useMemo(() => chooseGridLayout(Math.max(clients.length, 1), aspect), [clients.length, aspect]);

  return (
    <section
      className="admin-grid-board"
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`
      }}
    >
      {clients.length === 0 ? (
        <div className="admin-empty-tile">目前無連線使用者</div>
      ) : (
        clients.map((client) => (
          <ClientTile
            key={client.socketId}
            socketId={client.socketId}
            state={client.state}
            rank={client.rank}
            mode={mode}
            onResetOne={onResetOne}
          />
        ))
      )}
    </section>
  );
}
