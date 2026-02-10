import { io, type Socket } from "socket.io-client";
import type {
  Ack,
  ClientState,
  ClientToServerEvents,
  GameMode,
  JoinData,
  JoinPayload,
  ModePayload,
  PullData,
  ResetAllData,
  ResetData,
  ServerSnapshot,
  ServerToClientEvents,
  StartAllData,
  SnapshotData,
  StopReelData,
  StopReelPayload
} from "../../../shared/types";

export type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? window.location.origin;

let socketSingleton: ClientSocket | null = null;

function createSocket(): ClientSocket {
  return io(SOCKET_URL, {
    autoConnect: false,
    transports: ["websocket", "polling"]
  });
}

export function getSocket(): ClientSocket {
  if (!socketSingleton) {
    socketSingleton = createSocket();
  }
  return socketSingleton;
}

export async function ensureSocketConnected(): Promise<ClientSocket> {
  const socket = getSocket();
  if (socket.connected) {
    return socket;
  }

  await new Promise<void>((resolve, reject) => {
    const onConnect = () => {
      socket.off("connect_error", onError);
      resolve();
    };

    const onError = (error: unknown) => {
      socket.off("connect", onConnect);
      reject(error);
    };

    socket.once("connect", onConnect);
    socket.once("connect_error", onError);
    socket.connect();
  });

  return socket;
}

function emitWithAck<T>(emit: (ack: (response: Ack<T>) => void) => void): Promise<Ack<T>> {
  return new Promise((resolve) => {
    emit((response) => resolve(response));
  });
}

export function joinClient(payload: JoinPayload): Promise<Ack<JoinData>> {
  const socket = getSocket();
  return emitWithAck((ack) => socket.emit("client:join", payload, ack));
}

export function pullSpin(): Promise<Ack<PullData>> {
  const socket = getSocket();
  return emitWithAck((ack) => socket.emit("client:pull", ack));
}

export function stopReel(payload: StopReelPayload): Promise<Ack<StopReelData>> {
  const socket = getSocket();
  return emitWithAck((ack) => socket.emit("client:stopReel", payload, ack));
}

export function resetClient(): Promise<Ack<ResetData>> {
  const socket = getSocket();
  return emitWithAck((ack) => socket.emit("client:reset", ack));
}

export function setAdminMode(mode: GameMode): Promise<Ack<ModePayload>> {
  const socket = getSocket();
  return emitWithAck((ack) => socket.emit("admin:setMode", mode, ack));
}

export function resetOneClient(socketId: string): Promise<Ack<ResetData>> {
  const socket = getSocket();
  return emitWithAck((ack) => socket.emit("admin:resetOne", socketId, ack));
}

export function resetAllClients(): Promise<Ack<ResetAllData>> {
  const socket = getSocket();
  return emitWithAck((ack) => socket.emit("admin:resetAll", ack));
}

export function startAllClients(): Promise<Ack<StartAllData>> {
  const socket = getSocket();
  return emitWithAck((ack) => socket.emit("admin:startAll", ack));
}

export function fetchSnapshot(): Promise<Ack<SnapshotData>> {
  const socket = getSocket();
  return emitWithAck((ack) => socket.emit("state:get", ack));
}

export function getSelfState(snapshot: ServerSnapshot, socketId: string): ClientState | null {
  return snapshot.clients[socketId] ?? null;
}
