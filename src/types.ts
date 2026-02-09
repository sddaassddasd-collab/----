export type GameMode = "practice" | "official";

export type ReelDirection = "up_to_down" | "down_to_up";

export type StopIndex = 0 | 1 | 2 | 3 | 4;

export type PlayerViewState =
  | "name_input"
  | "ready"
  | "spinning"
  | "result"
  | "locked_wait_admin";

export interface ReelConfig {
  reelId: 1 | 2 | 3 | 4;
  direction: ReelDirection;
  symbols: readonly [string, string, string, string, string];
}

export interface SpinResult {
  spinId: string;
  roundId: string;
  stops: [StopIndex, StopIndex, StopIndex, StopIndex];
  symbols: [string, string, string, string];
  isJackpot: boolean;
  message?: "恭喜中獎" | "太可惜了><";
  finishedAt: number;
}

export interface PlayerSession {
  playerId: string;
  socketId: string;
  reconnectToken: string;
  name: string;
  connected: boolean;
  connectedAt: number;
  state: PlayerViewState;
  currentSpinId?: string;
  lastResult?: SpinResult;
  highlightedWinner: boolean;
  updatedAt: number;
  lastClientReqId?: string;
}

export interface PublicPlayerSession {
  playerId: string;
  name: string;
  connected: boolean;
  connectedAt: number;
  state: PlayerViewState;
  currentSpinId?: string;
  lastResult?: SpinResult;
  highlightedWinner: boolean;
  updatedAt: number;
}

export interface RoundState {
  roundId: string;
  mode: GameMode;
  resetVersion: number;
  winners: string[];
  confettiBurstCount: number;
}

export interface ServerState {
  mode: GameMode;
  round: RoundState;
  players: Record<string, PublicPlayerSession>;
}

export interface SpinProgress {
  spinId: string;
  playerId: string;
  stops: [StopIndex, StopIndex, StopIndex, StopIndex];
  stoppedReels: Set<1 | 2 | 3 | 4>;
  startedAt: number;
}

export interface PlayerJoinPayload {
  name: string;
  reconnectToken?: string;
}

export interface PlayerJoinAck {
  playerId: string;
  reconnectToken: string;
  mode: GameMode;
}

export interface AdminAuthAck {
  ok: boolean;
}
