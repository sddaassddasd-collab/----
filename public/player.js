const socket = io();

const REELS = [
  { reelId: 1, direction: "up_to_down", symbols: ["複", "0", "1", "2", "3"] },
  { reelId: 2, direction: "down_to_up", symbols: ["象", "10", "11", "12", "13"] },
  { reelId: 3, direction: "up_to_down", symbols: ["公", "20", "21", "22", "23"] },
  { reelId: 4, direction: "down_to_up", symbols: ["場", "30", "31", "32", "33"] }
];

const nameScreen = document.getElementById("name-screen");
const gameScreen = document.getElementById("game-screen");
const nameForm = document.getElementById("name-form");
const nameInput = document.getElementById("name-input");
const welcomeText = document.getElementById("welcome-text");
const modeBadge = document.getElementById("mode-badge");
const connBadge = document.getElementById("conn-badge");
const spinBtn = document.getElementById("spin-btn");
const resetBtn = document.getElementById("reset-btn");
const resultMsg = document.getElementById("result-msg");

let playerId = null;
let playerName = localStorage.getItem("slot_player_name") || "";
let reconnectToken = localStorage.getItem("slot_reconnect_token") || "";
let mode = "practice";
let ownSession = null;
let currentSpinId = null;

const reelRuntime = {
  1: { timer: null, index: 0, stopped: true },
  2: { timer: null, index: 0, stopped: true },
  3: { timer: null, index: 0, stopped: true },
  4: { timer: null, index: 0, stopped: true }
};

if (playerName) {
  nameInput.value = playerName;
}

function toModeText(rawMode) {
  return rawMode === "official" ? "正式模式" : "練習模式";
}

function setMessage(text, type = "normal") {
  resultMsg.textContent = text;
  resultMsg.classList.toggle("error", type === "error");
}

function setConnection(connected) {
  connBadge.textContent = connected ? "連線中" : "離線";
  connBadge.classList.toggle("offline", !connected);
}

function renderSymbol(reelId, symbol) {
  const el = document.getElementById(`reel-symbol-${reelId}`);
  if (el) {
    el.textContent = symbol;
  }
}

function resetReelSymbols() {
  for (const reel of REELS) {
    reelRuntime[reel.reelId].index = 0;
    renderSymbol(reel.reelId, reel.symbols[0]);
  }
}

function stopReelAnimation(reelId) {
  const runtime = reelRuntime[reelId];
  if (runtime.timer) {
    clearInterval(runtime.timer);
  }
  runtime.timer = null;
  runtime.stopped = true;
  const stopBtn = document.getElementById(`stop-${reelId}`);
  if (stopBtn) {
    stopBtn.disabled = true;
  }
}

function stopAllAnimations() {
  stopReelAnimation(1);
  stopReelAnimation(2);
  stopReelAnimation(3);
  stopReelAnimation(4);
}

function startSpinAnimation(spinId) {
  currentSpinId = spinId;
  setMessage("");

  for (const reel of REELS) {
    const runtime = reelRuntime[reel.reelId];
    if (runtime.timer) {
      clearInterval(runtime.timer);
    }

    runtime.stopped = false;
    const step = reel.direction === "up_to_down" ? 1 : -1;

    runtime.timer = setInterval(() => {
      runtime.index = (runtime.index + step + reel.symbols.length) % reel.symbols.length;
      renderSymbol(reel.reelId, reel.symbols[runtime.index]);
    }, 75 + reel.reelId * 20);

    const stopBtn = document.getElementById(`stop-${reel.reelId}`);
    if (stopBtn) {
      stopBtn.disabled = false;
    }
  }

  syncButtons();
}

function ownState() {
  return ownSession ? ownSession.state : "name_input";
}

function syncButtons() {
  const connected = socket.connected;
  const state = ownState();

  spinBtn.disabled = !playerId || !connected || state !== "ready";
  resetBtn.disabled = !playerId || !connected || state === "spinning" || mode === "official";

  for (const reel of REELS) {
    const stopBtn = document.getElementById(`stop-${reel.reelId}`);
    if (!stopBtn) {
      continue;
    }
    const active = state === "spinning" && !reelRuntime[reel.reelId].stopped;
    stopBtn.disabled = !active;
  }
}

function syncView() {
  modeBadge.textContent = toModeText(mode);

  if (!playerId) {
    nameScreen.classList.remove("hidden");
    gameScreen.classList.add("hidden");
    syncButtons();
    return;
  }

  nameScreen.classList.add("hidden");
  gameScreen.classList.remove("hidden");

  if (ownSession) {
    welcomeText.textContent = `玩家：${ownSession.name}`;

    if (ownSession.state !== "spinning") {
      currentSpinId = ownSession.currentSpinId || null;
      stopAllAnimations();
      if (ownSession.lastResult) {
        ownSession.lastResult.symbols.forEach((symbol, idx) => {
          renderSymbol(idx + 1, symbol);
        });
      }
    }
  } else {
    welcomeText.textContent = `玩家：${playerName}`;
  }

  syncButtons();
}

function joinWithName(name) {
  const payload = { name, reconnectToken };
  socket.emit("player:join", payload, (ack) => {
    playerId = ack.playerId;
    reconnectToken = ack.reconnectToken;
    mode = ack.mode;
    playerName = name;

    localStorage.setItem("slot_player_name", playerName);
    localStorage.setItem("slot_reconnect_token", reconnectToken);

    socket.emit("player:sync:request");
    syncView();
  });
}

function submitJoin(event) {
  event.preventDefault();
  const name = nameInput.value.trim();
  if (!name) {
    setMessage("請先輸入姓名", "error");
    return;
  }
  joinWithName(name);
}

function emitSpin() {
  if (ownState() !== "ready") {
    return;
  }
  const clientReqId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  socket.emit("player:spin:start", { clientReqId });
}

function emitReset() {
  if (!playerId) {
    return;
  }
  socket.emit("player:reset:request");
}

function emitStopReel(reelId) {
  if (!currentSpinId) {
    return;
  }
  socket.emit("player:reel:stop", {
    spinId: currentSpinId,
    reelId
  });
}

nameForm.addEventListener("submit", submitJoin);
spinBtn.addEventListener("click", emitSpin);
resetBtn.addEventListener("click", emitReset);

for (const reel of REELS) {
  const stopBtn = document.getElementById(`stop-${reel.reelId}`);
  if (stopBtn) {
    stopBtn.addEventListener("click", () => emitStopReel(reel.reelId));
  }
}

socket.on("connect", () => {
  setConnection(true);
  if (playerName && reconnectToken) {
    joinWithName(playerName);
  }
  syncButtons();
});

socket.on("disconnect", () => {
  setConnection(false);
  syncButtons();
});

socket.on("state:snapshot", (snapshot) => {
  mode = snapshot.mode;
  if (playerId && snapshot.players[playerId]) {
    ownSession = snapshot.players[playerId];
  }
  syncView();
});

socket.on("player:upsert", (player) => {
  if (player.playerId !== playerId) {
    return;
  }
  ownSession = player;
  syncView();
});

socket.on("mode:changed", (payload) => {
  mode = payload.mode;
  syncView();
});

socket.on("spin:started", (payload) => {
  if (payload.playerId !== playerId) {
    return;
  }
  startSpinAnimation(payload.spinId);
});

socket.on("spin:reel_stopped", (payload) => {
  if (payload.playerId !== playerId || payload.spinId !== currentSpinId) {
    return;
  }

  stopReelAnimation(payload.reelId);
  renderSymbol(payload.reelId, payload.symbol);
});

socket.on("spin:finished", (payload) => {
  if (payload.playerId !== playerId) {
    return;
  }

  currentSpinId = null;
  stopAllAnimations();

  const { result } = payload;
  result.symbols.forEach((symbol, idx) => {
    renderSymbol(idx + 1, symbol);
  });

  if (mode === "official") {
    setMessage(result.message || "");
  } else if (result.isJackpot) {
    setMessage("練習成功！複 象 公 場");
  } else {
    setMessage("練習完成，可再試一次");
  }

  syncButtons();
});

socket.on("round:reset", () => {
  currentSpinId = null;
  stopAllAnimations();
  resetReelSymbols();
  setMessage("已由後台重置，可重新開始");
  syncButtons();
});

socket.on("error:notice", (payload) => {
  if (payload && payload.message) {
    setMessage(payload.message, "error");
  }
});

resetReelSymbols();
setConnection(socket.connected);
syncView();
