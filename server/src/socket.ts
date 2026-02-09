import type {
  Ack,
  ClientState,
  ClientToServerEvents,
  GameMode,
  InterServerEvents,
  ServerToClientEvents,
  SocketData
} from "../../shared/types.js";
import { Server } from "socket.io";
import { spinSlot } from "./logic/slotLogic.js";
import { clients, createInitialClientState, getMode, resetClientState, setMode, toSnapshot } from "./state.js";

type TypedIo = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

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

function sanitizeName(input: string): string {
  const cleaned = input.trim().replace(/[<>]/g, "").slice(0, 24);
  return cleaned.length > 0 ? cleaned : "玩家";
}

function unlockLockedClientsForPractice(io: TypedIo): void {
  for (const [socketId, state] of clients.entries()) {
    if (state.phase === "locked") {
      const nextState: ClientState = { ...state, phase: "ready" };
      clients.set(socketId, nextState);
      emitClientState(io, socketId, nextState);
    }
  }
}

/**
 * Socket 事件流（對應需求）
 *
 * - `client:join(name)`：註冊/覆蓋目前 socket 的玩家資料。
 * - `client:pull`：執行一次 spin，回傳結果；official 下會鎖定該玩家。
 * - `client:reset`：僅 practice 生效。
 * - `admin:setMode`：切換全域 mode 並廣播。
 * - `admin:resetOne` / `admin:resetAll`：僅 official 生效，解鎖與重置玩家。
 * - 任一中獎都會廣播 `server:confetti`，不做去重（同輪多次中獎都會觸發）。
 */
export function registerSocketHandlers(io: TypedIo): void {
  io.on("connection", (socket) => {
    socket.on("client:join", (name, ack) => {
      const safeName = sanitizeName(typeof name === "string" ? name : "");
      const state = createInitialClientState(safeName);
      clients.set(socket.id, state);

      emitClientState(io, socket.id, state);
      emitSnapshot(io);

      ackOk(ack, {
        mode: getMode(),
        state
      });
    });

    socket.on("client:pull", (ack) => {
      const current = clients.get(socket.id);
      if (!current) {
        ackError(ack, "NOT_JOINED", "請先執行 client:join(name)");
        return;
      }

      const mode = getMode();
      if (mode === "official" && current.phase === "locked") {
        ackError(ack, "LOCKED", "official 模式下請等待 admin reset");
        return;
      }

      const spinning: ClientState = { ...current, phase: "spinning" };
      clients.set(socket.id, spinning);
      emitClientState(io, socket.id, spinning);

      const spin = spinSlot(mode);
      const isLocked = mode === "official";
      const nextState: ClientState = {
        ...spinning,
        reels: spin.finalReels,
        finalReels: spin.finalReels,
        isWin: spin.isWin,
        phase: isLocked ? "locked" : "ready"
      };
      clients.set(socket.id, nextState);

      const resultPayload = {
        socketId: socket.id,
        finalReels: spin.finalReels,
        isWin: spin.isWin,
        resultText: spin.resultText,
        mode,
        locked: isLocked
      } as const;

      socket.emit("server:pullResult", resultPayload);
      emitClientState(io, socket.id, nextState);
      emitSnapshot(io);

      if (spin.isWin) {
        io.emit("server:confetti", {
          socketId: socket.id,
          name: nextState.name,
          finalReels: spin.finalReels,
          triggeredAt: Date.now()
        });
      }

      ackOk(ack, {
        result: resultPayload,
        state: nextState
      });
    });

    socket.on("client:reset", (ack) => {
      const current = clients.get(socket.id);
      if (!current) {
        ackError(ack, "NOT_JOINED", "請先執行 client:join(name)");
        return;
      }

      if (getMode() !== "practice") {
        ackError(ack, "RESET_NOT_ALLOWED", "client:reset 僅 practice 模式可用");
        return;
      }

      const resetState = resetClientState(socket.id);
      if (!resetState) {
        ackError(ack, "NOT_FOUND", "找不到玩家狀態");
        return;
      }

      emitClientState(io, socket.id, resetState);
      emitSnapshot(io);
      ackOk(ack, { state: resetState });
    });

    socket.on("admin:setMode", (nextMode, ack) => {
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

    socket.on("admin:resetOne", (targetSocketId, ack) => {
      if (getMode() !== "official") {
        ackError(ack, "MODE_MISMATCH", "admin:resetOne 僅 official 模式可用");
        return;
      }

      if (!clients.has(targetSocketId)) {
        ackError(ack, "NOT_FOUND", "目標玩家不存在");
        return;
      }

      const state = resetClientState(targetSocketId);
      if (!state) {
        ackError(ack, "RESET_FAILED", "重置失敗");
        return;
      }

      emitClientState(io, targetSocketId, state);
      emitSnapshot(io);
      ackOk(ack, { state });
    });

    socket.on("admin:resetAll", (ack) => {
      if (getMode() !== "official") {
        ackError(ack, "MODE_MISMATCH", "admin:resetAll 僅 official 模式可用");
        return;
      }

      let resetCount = 0;
      for (const socketId of clients.keys()) {
        const state = resetClientState(socketId);
        if (!state) {
          continue;
        }
        resetCount += 1;
        emitClientState(io, socketId, state);
      }

      emitSnapshot(io);
      ackOk(ack, { resetCount });
    });

    socket.on("state:get", (ack) => {
      ackOk(ack, { snapshot: toSnapshot() });
    });

    socket.on("disconnect", () => {
      clients.delete(socket.id);
      emitSnapshot(io);
    });
  });
}
