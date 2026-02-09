export type GameMode = "practice" | "official";

export type ClientPhase = "ready" | "spinning" | "locked";

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
  result: PullResultPayload;
  state: ClientState;
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
  "client:reset": (ack?: (response: Ack<ResetData>) => void) => void;
  "admin:setMode": (mode: GameMode, ack?: (response: Ack<ModePayload>) => void) => void;
  "admin:resetOne": (socketId: string, ack?: (response: Ack<ResetData>) => void) => void;
  "admin:resetAll": (ack?: (response: Ack<ResetAllData>) => void) => void;
  "state:get": (ack?: (response: Ack<SnapshotData>) => void) => void;
}

export interface ServerToClientEvents {
  "server:mode": (payload: ModePayload) => void;
  "server:state": (payload: SnapshotPayload) => void;
  "server:clientState": (payload: ClientStatePayload) => void;
  "server:pullResult": (payload: PullResultPayload) => void;
  "server:confetti": (payload: ConfettiPayload) => void;
  "server:error": (payload: ErrorPayload) => void;
}

export interface InterServerEvents {}

export interface SocketData {}
