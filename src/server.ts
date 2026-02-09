import express from "express";
import http from "node:http";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Server, Socket } from "socket.io";
import { isJackpot, resolveSymbols, symbolAt } from "./gameEngine.js";
import {
  AdminAuthAck,
  GameMode,
  PlayerJoinAck,
  PlayerJoinPayload,
  PlayerSession,
  PublicPlayerSession,
  RoundState,
  ServerState,
  SpinProgress,
  SpinResult,
  StopIndex
} from "./types.js";

interface PlayerSpinStartPayload {
  clientReqId: string;
}

interface ReelStopPayload {
  spinId: string;
  reelId: 1 | 2 | 3 | 4;
  stopIndex: StopIndex;
}

interface AdminAuthPayload {
  token: string;
}

interface AdminModeSetPayload {
  mode: GameMode;
}

const PORT = Number(process.env.PORT ?? 3000);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? "admin";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

const players: Record<string, PlayerSession> = {};
const spins = new Map<string, SpinProgress>();
const reconnectIndex = new Map<string, string>();
const socketToPlayer = new Map<string, string>();
const authedAdmins = new Set<string>();

const roundState: RoundState = {
  roundId: randomUUID(),
  mode: "practice",
  resetVersion: 0,
  winners: [],
  confettiBurstCount: 0
};

let mode: GameMode = "practice";

function now(): number {
  return Date.now();
}

function sanitizeName(input: string): string {
  const cleaned = input.replace(/[<>]/g, "").trim().slice(0, 20);
  return cleaned.length > 0 ? cleaned : "玩家";
}

function toPublicPlayer(player: PlayerSession): PublicPlayerSession {
  return {
    playerId: player.playerId,
    name: player.name,
    connected: player.connected,
    connectedAt: player.connectedAt,
    state: player.state,
    currentSpinId: player.currentSpinId,
    lastResult: player.lastResult,
    highlightedWinner: player.highlightedWinner,
    updatedAt: player.updatedAt
  };
}

function buildSnapshot(): ServerState {
  const publicPlayers: Record<string, PublicPlayerSession> = {};
  for (const player of Object.values(players)) {
    publicPlayers[player.playerId] = toPublicPlayer(player);
  }

  return {
    mode,
    round: {
      ...roundState,
      winners: [...roundState.winners]
    },
    players: publicPlayers
  };
}

function emitSnapshotTo(socket?: Socket): void {
  const snapshot = buildSnapshot();
  if (socket) {
    socket.emit("state:snapshot", snapshot);
    return;
  }
  io.emit("state:snapshot", snapshot);
}

function emitPlayer(player: PlayerSession): void {
  io.emit("player:upsert", toPublicPlayer(player));
}

function playerFromSocket(socket: Socket): PlayerSession | undefined {
  const playerId = socketToPlayer.get(socket.id);
  if (!playerId) {
    return undefined;
  }
  return players[playerId];
}

function fail(socket: Socket, code: string, message: string): void {
  socket.emit("error:notice", { code, message });
}

function isValidStopIndex(value: unknown): value is StopIndex {
  return value === 0 || value === 1 || value === 2 || value === 3 || value === 4;
}

function resetRound(): void {
  roundState.roundId = randomUUID();
  roundState.mode = mode;
  roundState.resetVersion += 1;
  roundState.winners = [];
  roundState.confettiBurstCount = 0;

  spins.clear();

  for (const player of Object.values(players)) {
    player.state = "ready";
    player.currentSpinId = undefined;
    player.lastResult = undefined;
    player.highlightedWinner = false;
    player.lastClientReqId = undefined;
    player.updatedAt = now();
  }

  io.emit("round:reset", {
    roundId: roundState.roundId,
    resetVersion: roundState.resetVersion
  });

  emitSnapshotTo();
}

function isAdminSocket(socket: Socket): boolean {
  return authedAdmins.has(socket.id);
}

function markWinner(player: PlayerSession): void {
  if (!roundState.winners.includes(player.playerId)) {
    roundState.winners.push(player.playerId);
  }

  player.highlightedWinner = true;
  roundState.confettiBurstCount += 1;

  io.emit("winner:highlight", {
    playerId: player.playerId,
    roundId: roundState.roundId
  });

  io.emit("ui:confetti", {
    roundId: roundState.roundId,
    burstNo: roundState.confettiBurstCount,
    playerId: player.playerId
  });
}

function makeResult(spin: SpinProgress): SpinResult {
  const symbols = resolveSymbols(spin.stops);
  const jackpot = isJackpot(spin.stops);

  return {
    spinId: spin.spinId,
    roundId: roundState.roundId,
    stops: spin.stops,
    symbols,
    isJackpot: jackpot,
    message: mode === "official" ? (jackpot ? "恭喜中獎" : "太可惜了><") : undefined,
    finishedAt: now()
  };
}

io.on("connection", (socket) => {
  socket.on("player:join", (payload: PlayerJoinPayload, ack?: (response: PlayerJoinAck) => void) => {
    const candidateName = typeof payload?.name === "string" ? payload.name : "";
    const name = sanitizeName(candidateName);
    const token = typeof payload?.reconnectToken === "string" ? payload.reconnectToken : "";

    let player: PlayerSession | undefined;
    if (token.length > 0) {
      const existingPlayerId = reconnectIndex.get(token);
      if (existingPlayerId) {
        player = players[existingPlayerId];
      }
    }

    if (player) {
      if (player.socketId && player.socketId !== socket.id) {
        socketToPlayer.delete(player.socketId);
      }
      player.socketId = socket.id;
      player.name = name;
      player.connected = true;
      player.updatedAt = now();
      if (player.state === "name_input") {
        player.state = "ready";
      }
    } else {
      const playerId = randomUUID();
      const reconnectToken = randomUUID();
      player = {
        playerId,
        socketId: socket.id,
        reconnectToken,
        name,
        connected: true,
        connectedAt: now(),
        state: "ready",
        highlightedWinner: false,
        updatedAt: now()
      };
      players[playerId] = player;
      reconnectIndex.set(reconnectToken, playerId);
    }

    socketToPlayer.set(socket.id, player.playerId);
    emitPlayer(player);
    emitSnapshotTo();

    if (ack) {
      ack({
        playerId: player.playerId,
        reconnectToken: player.reconnectToken,
        mode
      });
    }
  });

  socket.on("player:spin:start", (payload: PlayerSpinStartPayload) => {
    const player = playerFromSocket(socket);
    if (!player) {
      fail(socket, "PLAYER_NOT_FOUND", "請先輸入姓名加入遊戲");
      return;
    }

    if (player.state !== "ready") {
      fail(socket, "INVALID_STATE", "目前狀態不可開始轉動");
      return;
    }

    if (typeof payload?.clientReqId === "string" && payload.clientReqId === player.lastClientReqId) {
      return;
    }

    player.lastClientReqId = typeof payload?.clientReqId === "string" ? payload.clientReqId : undefined;

    const spinId = randomUUID();
    const progress: SpinProgress = {
      spinId,
      playerId: player.playerId,
      stops: [0, 0, 0, 0],
      stoppedReels: new Set<1 | 2 | 3 | 4>(),
      startedAt: now()
    };

    spins.set(player.playerId, progress);
    player.currentSpinId = spinId;
    player.state = "spinning";
    player.updatedAt = now();

    io.emit("spin:started", {
      playerId: player.playerId,
      spinId
    });

    emitPlayer(player);
  });

  socket.on("player:reel:stop", (payload: ReelStopPayload) => {
    const player = playerFromSocket(socket);
    if (!player) {
      fail(socket, "PLAYER_NOT_FOUND", "請先輸入姓名加入遊戲");
      return;
    }

    const spin = spins.get(player.playerId);
    if (!spin) {
      fail(socket, "SPIN_NOT_FOUND", "目前沒有進行中的轉動");
      return;
    }

    if (!payload || spin.spinId !== payload.spinId) {
      fail(socket, "SPIN_ID_MISMATCH", "轉動識別碼不符");
      return;
    }

    const reelId = payload.reelId;
    if (reelId !== 1 && reelId !== 2 && reelId !== 3 && reelId !== 4) {
      fail(socket, "INVALID_REEL", "轉輪編號錯誤");
      return;
    }

    const expectedReelId = (spin.stoppedReels.size + 1) as 1 | 2 | 3 | 4;
    if (reelId !== expectedReelId) {
      fail(socket, "INVALID_REEL_ORDER", "請由左到右停止轉輪");
      return;
    }

    if (spin.stoppedReels.has(reelId)) {
      return;
    }

    if (!isValidStopIndex(payload.stopIndex)) {
      fail(socket, "INVALID_STOP_INDEX", "停點索引錯誤");
      return;
    }

    spin.stoppedReels.add(reelId);
    const stopIndex = payload.stopIndex;
    const stopArrayIndex = (reelId - 1) as 0 | 1 | 2 | 3;
    spin.stops[stopArrayIndex] = stopIndex;
    const symbol = symbolAt(reelId, stopIndex);

    io.emit("spin:reel_stopped", {
      playerId: player.playerId,
      spinId: spin.spinId,
      reelId,
      symbol
    });

    if (spin.stoppedReels.size < 4) {
      return;
    }

    const result = makeResult(spin);

    player.currentSpinId = undefined;
    player.lastResult = result;
    player.state = mode === "official" ? "locked_wait_admin" : "result";
    player.updatedAt = now();

    if (result.isJackpot) {
      markWinner(player);
    }

    spins.delete(player.playerId);

    io.emit("spin:finished", {
      playerId: player.playerId,
      result
    });

    emitPlayer(player);
    emitSnapshotTo();
  });

  socket.on("player:reset:request", () => {
    const player = playerFromSocket(socket);
    if (!player) {
      fail(socket, "PLAYER_NOT_FOUND", "請先輸入姓名加入遊戲");
      return;
    }

    if (mode === "official") {
      fail(socket, "OFFICIAL_LOCKED", "正式模式僅後台可 reset");
      return;
    }

    if (player.state === "spinning") {
      fail(socket, "SPINNING", "轉動中不可 reset");
      return;
    }

    player.state = "ready";
    player.currentSpinId = undefined;
    player.lastResult = undefined;
    player.highlightedWinner = false;
    player.updatedAt = now();
    spins.delete(player.playerId);

    emitPlayer(player);
    emitSnapshotTo();
  });

  socket.on("player:sync:request", () => {
    emitSnapshotTo(socket);
  });

  socket.on("admin:auth", (payload: AdminAuthPayload, ack?: (response: AdminAuthAck) => void) => {
    if (payload?.token === ADMIN_TOKEN) {
      authedAdmins.add(socket.id);
      if (ack) {
        ack({ ok: true });
      }
      emitSnapshotTo(socket);
      return;
    }

    if (ack) {
      ack({ ok: false });
    }
  });

  socket.on("admin:mode:set", (payload: AdminModeSetPayload) => {
    if (!isAdminSocket(socket)) {
      fail(socket, "UNAUTHORIZED", "請先登入後台");
      return;
    }

    const nextMode = payload?.mode;
    if (nextMode !== "practice" && nextMode !== "official") {
      fail(socket, "INVALID_MODE", "模式錯誤");
      return;
    }

    if (mode === nextMode) {
      return;
    }

    mode = nextMode;
    roundState.mode = nextMode;

    for (const player of Object.values(players)) {
      if (mode === "practice" && player.state === "locked_wait_admin") {
        player.state = "result";
      }
      player.updatedAt = now();
      emitPlayer(player);
    }

    io.emit("mode:changed", {
      mode,
      roundId: roundState.roundId
    });

    emitSnapshotTo();
  });

  socket.on("admin:round:reset", () => {
    if (!isAdminSocket(socket)) {
      fail(socket, "UNAUTHORIZED", "請先登入後台");
      return;
    }

    resetRound();
  });

  socket.on("admin:sync:request", () => {
    if (!isAdminSocket(socket)) {
      fail(socket, "UNAUTHORIZED", "請先登入後台");
      return;
    }
    emitSnapshotTo(socket);
  });

  socket.on("disconnect", () => {
    const playerId = socketToPlayer.get(socket.id);
    if (playerId) {
      const player = players[playerId];
      if (player) {
        player.connected = false;
        player.socketId = "";
        player.currentSpinId = undefined;
        if (player.state === "spinning") {
          player.state = mode === "official" ? "locked_wait_admin" : "ready";
        }
        player.updatedAt = now();
      }

      spins.delete(playerId);
      socketToPlayer.delete(socket.id);
      if (player) {
        emitPlayer(player);
      }
      emitSnapshotTo();
    }

    authedAdmins.delete(socket.id);
  });
});

const publicDir = path.resolve(process.cwd(), "public");
app.use(express.static(publicDir));

app.get("/", (_req, res) => {
  res.redirect("/player");
});

app.get("/player", (_req, res) => {
  res.sendFile(path.join(publicDir, "player.html"));
});

app.get("/admin", (_req, res) => {
  res.sendFile(path.join(publicDir, "admin.html"));
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Slot machine server running at http://localhost:${PORT}`);
});
