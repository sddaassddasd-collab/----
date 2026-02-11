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

export default function GridBoard({ clients, mode, onResetOne }: GridBoardProps) {
  return (
    <section className="admin-grid-board">
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
