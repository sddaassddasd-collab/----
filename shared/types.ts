export type GameMode = "practice" | "official";

export type ClientPhase = "ready" | "spinning" | "locked";

export type ReelId = 1 | 2 | 3 | 4;

export type StopIndex = 0 | 1 | 2 | 3 | 4;

export type Reels = readonly [string, string, string, string];

export interface ClientState {
  name: string;
  phase: ClientPhase;
  reels: Reels;
  finalReels: Reels | null;
  isWin: boolean;
}

export interface ServerSnapshot {
  mode: GameMode;
  clients: Record<string, ClientState>;
}

export interface ModePayload {
  mode: GameMode;
}

export interface SnapshotPayload {
  snapshot: ServerSnapshot;
}

export interface ClientStatePayload {
  socketId: string;
  state: ClientState;
}

export interface PullResultPayload {
  socketId: string;
  finalReels: Reels;
  isWin: boolean;
  resultText: string;
  mode: GameMode;
  locked: boolean;
}

export interface ConfettiPayload {
  socketId: string;
  name: string;
  finalReels: Reels;
  triggeredAt: number;
}

export interface ErrorPayload {
  code: string;
  message: string;
}

export interface JoinData {
  mode: GameMode;
  state: ClientState;
}

export interface PullData {
  state: ClientState;
}

export interface StopReelPayload {
  reelId: ReelId;
  stopIndex: StopIndex;
}

export interface StopReelData {
  socketId: string;
  reelId: ReelId;
  stopIndex: StopIndex;
  symbol: string;
  completed: boolean;
  state: ClientState;
  result?: PullResultPayload;
}

export interface ResetData {
  state: ClientState;
}

export interface ResetAllData {
  resetCount: number;
}

export interface SnapshotData {
  snapshot: ServerSnapshot;
}

export interface RebindAllData {
  rebindCount: number;
}

export interface ForceRebindPayload {
  message: string;
  triggeredAt: number;
}

export interface AckOk<T> {
  ok: true;
  data: T;
}

export interface AckError {
  ok: false;
  code: string;
  error: string;
}

export type Ack<T> = AckOk<T> | AckError;

export interface ClientToServerEvents {
  "client:join": (name: string, ack?: (response: Ack<JoinData>) => void) => void;
  "client:pull": (ack?: (response: Ack<PullData>) => void) => void;
  "client:stopReel": (payload: StopReelPayload, ack?: (response: Ack<StopReelData>) => void) => void;
  "client:reset": (ack?: (response: Ack<ResetData>) => void) => void;
  "admin:setMode": (mode: GameMode, ack?: (response: Ack<ModePayload>) => void) => void;
  "admin:resetOne": (socketId: string, ack?: (response: Ack<ResetData>) => void) => void;
  "admin:resetAll": (ack?: (response: Ack<ResetAllData>) => void) => void;
  "admin:rebindAll": (ack?: (response: Ack<RebindAllData>) => void) => void;
  "state:get": (ack?: (response: Ack<SnapshotData>) => void) => void;
}

export interface ServerToClientEvents {
  "server:mode": (payload: ModePayload) => void;
  "server:state": (payload: SnapshotPayload) => void;
  "server:clientState": (payload: ClientStatePayload) => void;
  "server:pullResult": (payload: PullResultPayload) => void;
  "server:confetti": (payload: ConfettiPayload) => void;
  "server:forceRebind": (payload: ForceRebindPayload) => void;
  "server:error": (payload: ErrorPayload) => void;
}

export interface InterServerEvents {}

export interface SocketData {
  isAdmin?: boolean;
  adminSessionId?: string;
}
