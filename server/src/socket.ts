import type {
  Ack,
  ClientState,
  ClientToServerEvents,
  GameMode,
  InterServerEvents,
  JoinPayload,
  ReelId,
  Reels,
  ServerToClientEvents,
  StopIndex,
  SocketData
} from "../../shared/types.js";
import { randomBytes } from "node:crypto";
import { Server, type Socket } from "socket.io";
import { isAdminSessionValid, readAdminSessionId, touchAdminSession } from "./adminAuth.js";
import { getEmptyReels, settleByReels, symbolAt } from "./logic/slotLogic.js";
import { clients, createInitialClientState, getMode, setMode, toSnapshot } from "./state.js";

type TypedIo = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

const reconnectStates = new Map<string, ClientState>();
const socketToReconnectToken = new Map<string, string>();
const reconnectTokenToSocket = new Map<string, string>();

function ackOk<T>(ack: ((response: Ack<T>) => void) | undefined, data: T): void {
  if (!ack) {
    return;
  }
  ack({ ok: true, data });
}

function ackError<T>(ack: ((response: Ack<T>) => void) | undefined, code: string, error: string): void {
  if (!ack) {
    return;
  }
  ack({ ok: false, code, error });
}

function emitSnapshot(io: TypedIo): void {
  io.emit("server:state", { snapshot: toSnapshot() });
}

function emitClientState(io: TypedIo, socketId: string, state: ClientState): void {
  io.emit("server:clientState", { socketId, state });
}

function hydrateAdminAuth(socket: TypedSocket): void {
  const sessionId = readAdminSessionId(socket.handshake.headers.cookie);
  if (!sessionId || !isAdminSessionValid(sessionId)) {
    socket.data.isAdmin = false;
    socket.data.adminSessionId = undefined;
    return;
  }

  socket.data.isAdmin = true;
  socket.data.adminSessionId = sessionId;
  touchAdminSession(sessionId);
}

function ensureAdminAuth<T>(
  socket: TypedSocket,
  ack: ((response: Ack<T>) => void) | undefined,
  actionName: string
): boolean {
  const sessionId = socket.data.adminSessionId;
  if (!sessionId || !isAdminSessionValid(sessionId)) {
    socket.data.isAdmin = false;
    socket.data.adminSessionId = undefined;
    ackError(ack, "UNAUTHORIZED", `${actionName} 需要 admin token 登入`);
    return false;
  }

  socket.data.isAdmin = true;
  touchAdminSession(sessionId);
  return true;
}

function sanitizeName(input: string): string {
  const cleaned = input.trim().replace(/[<>]/g, "").slice(0, 24);
  return cleaned.length > 0 ? cleaned : "玩家";
}

function isValidReelId(value: unknown): value is ReelId {
  return value === 1 || value === 2 || value === 3 || value === 4;
}

function isValidStopIndex(value: unknown): value is StopIndex {
  return value === 0 || value === 1 || value === 2 || value === 3 || value === 4;
}

function nextExpectedReelId(reels: Reels): ReelId | null {
  for (let index = 0; index < reels.length; index += 1) {
    if (reels[index] === "-") {
      return (index + 1) as ReelId;
    }
  }
  return null;
}

function withReelSymbol(reels: Reels, reelId: ReelId, symbol: string): Reels {
  const next = [...reels] as [string, string, string, string];
  next[reelId - 1] = symbol;
  return next;
}

function parseJoinPayload(payload: JoinPayload | string): { name: string; reconnectToken: string } {
  if (typeof payload === "string") {
    return {
      name: payload,
      reconnectToken: ""
    };
  }

  return {
    name: typeof payload?.name === "string" ? payload.name : "",
    reconnectToken: typeof payload?.reconnectToken === "string" ? payload.reconnectToken.trim() : ""
  };
}

function createReconnectToken(): string {
  let token = "";
  do {
    token = randomBytes(24).toString("hex");
  } while (reconnectStates.has(token));
  return token;
}

function getReconnectTokenBySocketId(socketId: string): string | null {
  return socketToReconnectToken.get(socketId) ?? null;
}

function getClientStateBySocketId(socketId: string): ClientState | null {
  const reconnectToken = getReconnectTokenBySocketId(socketId);
  if (!reconnectToken) {
    return null;
  }
  return reconnectStates.get(reconnectToken) ?? null;
}

function bindSocketToClient(socketId: string, reconnectToken: string, state: ClientState): void {
  const previousSocketId = reconnectTokenToSocket.get(reconnectToken);
  if (previousSocketId && previousSocketId !== socketId) {
    clients.delete(previousSocketId);
    socketToReconnectToken.delete(previousSocketId);
  }

  socketToReconnectToken.set(socketId, reconnectToken);
  reconnectTokenToSocket.set(reconnectToken, socketId);
  clients.set(socketId, state);
}

function detachSocketFromClient(socketId: string): void {
  const reconnectToken = socketToReconnectToken.get(socketId);
  socketToReconnectToken.delete(socketId);
  clients.delete(socketId);

  if (!reconnectToken) {
    return;
  }
  if (reconnectTokenToSocket.get(reconnectToken) === socketId) {
    reconnectTokenToSocket.delete(reconnectToken);
  }
}

function attachClient(socketId: string, name: string, reconnectTokenInput: string): { reconnectToken: string; state: ClientState } {
  const candidateToken = reconnectTokenInput.trim();
  const hasExisting = candidateToken.length > 0 && reconnectStates.has(candidateToken);
  const reconnectToken = hasExisting ? candidateToken : createReconnectToken();
  const previousState = reconnectStates.get(reconnectToken);
  const state = previousState
    ? {
        ...previousState,
        name
      }
    : createInitialClientState(name);

  reconnectStates.set(reconnectToken, state);
  bindSocketToClient(socketId, reconnectToken, state);
  return { reconnectToken, state };
}

function setClientStateForSocket(socketId: string, nextState: ClientState): boolean {
  const reconnectToken = getReconnectTokenBySocketId(socketId);
  if (!reconnectToken) {
    return false;
  }
  reconnectStates.set(reconnectToken, nextState);
  clients.set(socketId, nextState);
  return true;
}

function resetClientStateForSocket(socketId: string): ClientState | null {
  const current = getClientStateBySocketId(socketId);
  if (!current) {
    return null;
  }
  const resetState = createInitialClientState(current.name);
  const ok = setClientStateForSocket(socketId, resetState);
  return ok ? resetState : null;
}

function unlockLockedClientsForPractice(io: TypedIo): void {
  for (const [reconnectToken, state] of reconnectStates.entries()) {
    if (state.phase !== "locked") {
      continue;
    }

    const nextState: ClientState = { ...state, phase: "ready" };
    reconnectStates.set(reconnectToken, nextState);

    const socketId = reconnectTokenToSocket.get(reconnectToken);
    if (!socketId) {
      continue;
    }
    clients.set(socketId, nextState);
    emitClientState(io, socketId, nextState);
  }
}

/**
 * Socket 事件流（對應需求）
 *
 * - `client:join(name)`：註冊/覆蓋目前 socket 的玩家資料。
 * - `client:pull`：僅 practice 可用；official 需由 `admin:startAll` 統一開始。
 * - `client:stopReel`：每停一欄就上報後端；第 4 欄停下時才結算結果。
 * - `client:reset`：僅 practice 生效。
 * - `admin:setMode`：切換全域 mode 並廣播。
 * - `admin:startAll`：official 模式下一鍵啟動所有 ready 玩家轉動。
 * - `admin:resetOne` / `admin:resetAll`：僅 official 生效，解鎖與重置玩家。
 * - `admin:rebindAll`：清空所有玩家狀態並要求前台重新輸入姓名。
 * - 任一中獎都會廣播 `server:confetti`，不做去重（同輪多次中獎都會觸發）。
 */
export function registerSocketHandlers(io: TypedIo): void {
  io.on("connection", (socket) => {
    hydrateAdminAuth(socket);

    socket.on("client:join", (payload, ack) => {
      const parsed = parseJoinPayload(payload);
      const safeName = sanitizeName(parsed.name);
      const joined = attachClient(socket.id, safeName, parsed.reconnectToken);

      emitClientState(io, socket.id, joined.state);
      emitSnapshot(io);

      ackOk(ack, {
        mode: getMode(),
        state: joined.state,
        reconnectToken: joined.reconnectToken
      });
    });

    socket.on("client:pull", (ack) => {
      const current = getClientStateBySocketId(socket.id);
      if (!current) {
        ackError(ack, "NOT_JOINED", "請先執行 client:join(name)");
        return;
      }

      const mode = getMode();
      if (mode === "official") {
        ackError(ack, "PULL_CONTROLLED_BY_ADMIN", "official 模式下只能由後台開始轉動");
        return;
      }

      if (current.phase === "locked") {
        ackError(ack, "LOCKED", "目前為鎖定狀態，請先重置");
        return;
      }

      if (current.phase === "spinning") {
        ackError(ack, "SPINNING", "目前已在轉動中");
        return;
      }

      const spinning: ClientState = {
        ...current,
        phase: "spinning",
        reels: getEmptyReels(),
        finalReels: null,
        isWin: false,
        finishedAt: null
      };
      if (!setClientStateForSocket(socket.id, spinning)) {
        ackError(ack, "NOT_JOINED", "請先執行 client:join(name)");
        return;
      }
      emitClientState(io, socket.id, spinning);
      emitSnapshot(io);

      ackOk(ack, { state: spinning });
    });

    socket.on("client:stopReel", (payload, ack) => {
      const current = getClientStateBySocketId(socket.id);
      if (!current) {
        ackError(ack, "NOT_JOINED", "請先執行 client:join(name)");
        return;
      }

      if (current.phase !== "spinning") {
        ackError(ack, "INVALID_STATE", "目前不在轉動中");
        return;
      }

      const reelId = payload?.reelId;
      const stopIndex = payload?.stopIndex;
      if (!isValidReelId(reelId)) {
        ackError(ack, "INVALID_REEL_ID", "reelId 必須為 1~4");
        return;
      }
      if (!isValidStopIndex(stopIndex)) {
        ackError(ack, "INVALID_STOP_INDEX", "stopIndex 必須為 0~4");
        return;
      }

      const expectedReelId = nextExpectedReelId(current.reels);
      if (!expectedReelId) {
        ackError(ack, "ROUND_DONE", "本輪已完成，請重新開始");
        return;
      }
      if (reelId !== expectedReelId) {
        ackError(ack, "INVALID_ORDER", `請先停止第 ${expectedReelId} 欄`);
        return;
      }

      const symbol = symbolAt(reelId, stopIndex);
      const nextReels = withReelSymbol(current.reels, reelId, symbol);
      const nextExpected = nextExpectedReelId(nextReels);

      if (nextExpected) {
        const nextState: ClientState = {
          ...current,
          phase: "spinning",
          reels: nextReels,
          finalReels: null,
          isWin: false,
          finishedAt: null
        };
        if (!setClientStateForSocket(socket.id, nextState)) {
          ackError(ack, "NOT_JOINED", "請先執行 client:join(name)");
          return;
        }

        emitClientState(io, socket.id, nextState);
        emitSnapshot(io);
        ackOk(ack, {
          socketId: socket.id,
          reelId,
          stopIndex,
          symbol,
          completed: false,
          state: nextState
        });
        return;
      }

      const mode = getMode();
      const settle = settleByReels(mode, nextReels);
      const locked = mode === "official";
      const finishedAt = Date.now();
      const finalState: ClientState = {
        ...current,
        phase: locked ? "locked" : "ready",
        reels: nextReels,
        finalReels: nextReels,
        isWin: settle.isWin,
        finishedAt
      };
      if (!setClientStateForSocket(socket.id, finalState)) {
        ackError(ack, "NOT_JOINED", "請先執行 client:join(name)");
        return;
      }

      const resultPayload = {
        socketId: socket.id,
        finalReels: nextReels,
        isWin: settle.isWin,
        resultText: settle.resultText,
        mode,
        locked
      } as const;

      socket.emit("server:pullResult", resultPayload);
      emitClientState(io, socket.id, finalState);
      emitSnapshot(io);

      if (settle.isWin) {
        io.emit("server:confetti", {
          socketId: socket.id,
          name: finalState.name,
          finalReels: nextReels,
          triggeredAt: Date.now()
        });
      }

      ackOk(ack, {
        socketId: socket.id,
        reelId,
        stopIndex,
        symbol,
        completed: true,
        state: finalState,
        result: resultPayload
      });
    });

    socket.on("client:reset", (ack) => {
      const current = getClientStateBySocketId(socket.id);
      if (!current) {
        ackError(ack, "NOT_JOINED", "請先執行 client:join(name)");
        return;
      }

      if (getMode() !== "practice") {
        ackError(ack, "RESET_NOT_ALLOWED", "client:reset 僅 practice 模式可用");
        return;
      }

      if (current.phase === "spinning") {
        ackError(ack, "SPINNING", "轉動中不可重置");
        return;
      }

      const resetState = resetClientStateForSocket(socket.id);
      if (!resetState) {
        ackError(ack, "NOT_FOUND", "找不到玩家狀態");
        return;
      }

      emitClientState(io, socket.id, resetState);
      emitSnapshot(io);
      ackOk(ack, { state: resetState });
    });

    socket.on("admin:setMode", (nextMode, ack) => {
      if (!ensureAdminAuth(socket, ack, "admin:setMode")) {
        return;
      }

      if (nextMode !== "practice" && nextMode !== "official") {
        ackError(ack, "INVALID_MODE", "mode 必須為 practice 或 official");
        return;
      }

      const mode = setMode(nextMode as GameMode);
      if (mode === "practice") {
        // 切回練習時，將官方鎖定中的玩家改回可操作狀態。
        unlockLockedClientsForPractice(io);
      }

      io.emit("server:mode", { mode });
      emitSnapshot(io);
      ackOk(ack, { mode });
    });

    socket.on("admin:startAll", (ack) => {
      if (!ensureAdminAuth(socket, ack, "admin:startAll")) {
        return;
      }

      if (getMode() !== "official") {
        ackError(ack, "MODE_MISMATCH", "admin:startAll 僅 official 模式可用");
        return;
      }

      let startedCount = 0;
      for (const [socketId, state] of clients.entries()) {
        if (state.phase !== "ready") {
          continue;
        }

        const spinning: ClientState = {
          ...state,
          phase: "spinning",
          reels: getEmptyReels(),
          finalReels: null,
          isWin: false,
          finishedAt: null
        };
        if (!setClientStateForSocket(socketId, spinning)) {
          continue;
        }

        startedCount += 1;
        emitClientState(io, socketId, spinning);
      }

      emitSnapshot(io);
      ackOk(ack, { startedCount });
    });

    socket.on("admin:resetOne", (targetSocketId, ack) => {
      if (!ensureAdminAuth(socket, ack, "admin:resetOne")) {
        return;
      }

      if (getMode() !== "official") {
        ackError(ack, "MODE_MISMATCH", "admin:resetOne 僅 official 模式可用");
        return;
      }

      if (!clients.has(targetSocketId)) {
        ackError(ack, "NOT_FOUND", "目標玩家不存在");
        return;
      }

      const state = resetClientStateForSocket(targetSocketId);
      if (!state) {
        ackError(ack, "RESET_FAILED", "重置失敗");
        return;
      }

      emitClientState(io, targetSocketId, state);
      emitSnapshot(io);
      ackOk(ack, { state });
    });

    socket.on("admin:resetAll", (ack) => {
      if (!ensureAdminAuth(socket, ack, "admin:resetAll")) {
        return;
      }

      if (getMode() !== "official") {
        ackError(ack, "MODE_MISMATCH", "admin:resetAll 僅 official 模式可用");
        return;
      }

      let resetCount = 0;
      for (const [reconnectToken, state] of reconnectStates.entries()) {
        const resetState = createInitialClientState(state.name);
        reconnectStates.set(reconnectToken, resetState);

        const socketId = reconnectTokenToSocket.get(reconnectToken);
        if (!socketId) {
          continue;
        }
        resetCount += 1;
        clients.set(socketId, resetState);
        emitClientState(io, socketId, resetState);
      }

      emitSnapshot(io);
      ackOk(ack, { resetCount });
    });

    socket.on("admin:rebindAll", (ack) => {
      if (!ensureAdminAuth(socket, ack, "admin:rebindAll")) {
        return;
      }

      const rebindCount = clients.size;
      reconnectStates.clear();
      socketToReconnectToken.clear();
      reconnectTokenToSocket.clear();
      clients.clear();

      io.emit("server:forceRebind", {
        message: "後台已重設，請重新輸入姓名",
        triggeredAt: Date.now()
      });
      emitSnapshot(io);
      ackOk(ack, { rebindCount });
    });

    socket.on("state:get", (ack) => {
      ackOk(ack, { snapshot: toSnapshot() });
    });

    socket.on("disconnect", () => {
      detachSocketFromClient(socket.id);
      emitSnapshot(io);
    });
  });
}
