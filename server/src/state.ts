import type { ClientState, GameMode, ServerSnapshot } from "../../shared/types.js";
import { getEmptyReels } from "./logic/slotLogic.js";

/**
 * 全域模式（需求 1）
 */
let mode: GameMode = "practice";

/**
 * 全部連線中的 client（需求 2）
 * key = socket.id
 */
export const clients = new Map<string, ClientState>();

export function getMode(): GameMode {
  return mode;
}

export function setMode(nextMode: GameMode): GameMode {
  mode = nextMode;
  return mode;
}

export function createInitialClientState(name: string): ClientState {
  return {
    name,
    phase: "ready",
    reels: getEmptyReels(),
    finalReels: null,
    isWin: false,
    finishedAt: null
  };
}

export function resetClientState(socketId: string): ClientState | null {
  const current = clients.get(socketId);
  if (!current) {
    return null;
  }
  const resetState = createInitialClientState(current.name);
  clients.set(socketId, resetState);
  return resetState;
}

export function toSnapshot(): ServerSnapshot {
  const record: Record<string, ClientState> = {};
  for (const [socketId, state] of clients.entries()) {
    record[socketId] = state;
  }
  return {
    mode,
    clients: record
  };
}
