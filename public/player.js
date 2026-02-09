const socket = io();

const REELS = [
  { reelId: 1, direction: "up_to_down", symbols: ["複", "0", "1", "2", "3"] },
  { reelId: 2, direction: "down_to_up", symbols: ["象", "10", "11", "12", "13"] },
  { reelId: 3, direction: "up_to_down", symbols: ["公", "20", "21", "22", "23"] },
  { reelId: 4, direction: "down_to_up", symbols: ["場", "30", "31", "32", "33"] }
];

const ITEM_HEIGHT = 48;

const nameScreen = document.getElementById("name-screen");
const gameScreen = document.getElementById("game-screen");
const nameForm = document.getElementById("name-form");
const nameInput = document.getElementById("name-input");
const welcomeText = document.getElementById("welcome-text");
const modeBadge = document.getElementById("mode-badge");
const connBadge = document.getElementById("conn-badge");
const spinBtn = document.getElementById("spin-btn");
const stopNextBtn = document.getElementById("stop-next-btn");
const resetBtn = document.getElementById("reset-btn");
const resultMsg = document.getElementById("result-msg");

let playerId = null;
let playerName = localStorage.getItem("slot_player_name") || "";
let reconnectToken = localStorage.getItem("slot_reconnect_token") || "";
let mode = "practice";
let ownSession = null;
let currentSpinId = null;
let nextStopReel = 1;
let waitingStopAck = false;

const reelRuntime = {
  1: { timer: null, position: 5, stopped: true, trackEl: document.getElementById("reel-track-1") },
  2: { timer: null, position: 5, stopped: true, trackEl: document.getElementById("reel-track-2") },
  3: { timer: null, position: 5, stopped: true, trackEl: document.getElementById("reel-track-3") },
  4: { timer: null, position: 5, stopped: true, trackEl: document.getElementById("reel-track-4") }
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

function ownState() {
  return ownSession ? ownSession.state : "name_input";
}

function applyReelTransform(reelId, withTransition = false) {
  const runtime = reelRuntime[reelId];
  if (!runtime.trackEl) {
    return;
  }

  runtime.trackEl.style.transition = withTransition
    ? "transform 160ms cubic-bezier(0.2, 0.8, 0.2, 1)"
    : "none";

  const offset = -((runtime.position - 1) * ITEM_HEIGHT);
  runtime.trackEl.style.transform = `translateY(${offset}px)`;
}

function normalizePosition(reelId) {
  const runtime = reelRuntime[reelId];
  const symbolCount = REELS[reelId - 1].symbols.length;

  while (runtime.position < symbolCount) {
    runtime.position += symbolCount;
  }

  while (runtime.position >= symbolCount * 2) {
    runtime.position -= symbolCount;
  }
}

function setReelToSymbol(reelId, symbol, withTransition = false) {
  const reel = REELS[reelId - 1];
  const symbolIndex = reel.symbols.indexOf(symbol);
  if (symbolIndex < 0) {
    return;
  }

  const runtime = reelRuntime[reelId];
  runtime.position = reel.symbols.length + symbolIndex;
  applyReelTransform(reelId, withTransition);
}

function buildReelTrack(reel) {
  const runtime = reelRuntime[reel.reelId];
  if (!runtime.trackEl) {
    return;
  }

  runtime.trackEl.replaceChildren();
  const repeated = [...reel.symbols, ...reel.symbols, ...reel.symbols];

  for (const symbol of repeated) {
    const cell = document.createElement("div");
    cell.className = "reel-item";
    cell.textContent = symbol;
    runtime.trackEl.appendChild(cell);
  }
}

function initializeReels() {
  for (const reel of REELS) {
    buildReelTrack(reel);
    setReelToSymbol(reel.reelId, reel.symbols[0], false);
  }
}

function resetReelSymbols() {
  for (const reel of REELS) {
    setReelToSymbol(reel.reelId, reel.symbols[0], false);
  }
}

function stopReelAnimation(reelId, finalSymbol) {
  const runtime = reelRuntime[reelId];
  if (runtime.timer) {
    clearInterval(runtime.timer);
  }

  runtime.timer = null;
  runtime.stopped = true;

  if (typeof finalSymbol === "string") {
    setReelToSymbol(reelId, finalSymbol, true);
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
  nextStopReel = 1;
  waitingStopAck = false;
  setMessage("");

  for (const reel of REELS) {
    const runtime = reelRuntime[reel.reelId];

    if (runtime.timer) {
      clearInterval(runtime.timer);
    }

    runtime.stopped = false;
    const step = reel.direction === "up_to_down" ? 0.4 : -0.4;

    runtime.timer = setInterval(() => {
      runtime.position += step;
      normalizePosition(reel.reelId);
      applyReelTransform(reel.reelId, false);
    }, 34 + reel.reelId * 4);
  }

  syncButtons();
}

function syncButtons() {
  const connected = socket.connected;
  const state = ownState();

  spinBtn.disabled = !playerId || !connected || state !== "ready";

  const stopEnabled = Boolean(playerId && connected && state === "spinning" && nextStopReel <= 4 && !waitingStopAck);
  stopNextBtn.disabled = !stopEnabled;

  if (state === "spinning" && nextStopReel <= 4) {
    stopNextBtn.textContent = waitingStopAck ? `停止第 ${nextStopReel} 欄...` : `停止第 ${nextStopReel} 欄`;
  } else if (nextStopReel > 4) {
    stopNextBtn.textContent = "停止完成";
  } else {
    stopNextBtn.textContent = "停止";
  }

  resetBtn.disabled = !playerId || !connected || state === "spinning" || mode === "official";
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
      nextStopReel = 1;
      waitingStopAck = false;
      stopAllAnimations();

      if (ownSession.lastResult) {
        ownSession.lastResult.symbols.forEach((symbol, idx) => {
          setReelToSymbol(idx + 1, symbol, false);
        });
      } else {
        resetReelSymbols();
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

function emitStopNext() {
  if (ownState() !== "spinning" || !currentSpinId) {
    return;
  }

  if (nextStopReel > 4 || waitingStopAck) {
    return;
  }

  const reelId = nextStopReel;
  waitingStopAck = true;
  syncButtons();

  socket.emit("player:reel:stop", {
    spinId: currentSpinId,
    reelId
  });
}

nameForm.addEventListener("submit", submitJoin);
spinBtn.addEventListener("click", emitSpin);
stopNextBtn.addEventListener("click", emitStopNext);
resetBtn.addEventListener("click", emitReset);

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

  stopReelAnimation(payload.reelId, payload.symbol);

  if (payload.reelId === nextStopReel) {
    nextStopReel += 1;
  } else {
    nextStopReel = Math.max(nextStopReel, payload.reelId + 1);
  }

  waitingStopAck = false;
  syncButtons();
});

socket.on("spin:finished", (payload) => {
  if (payload.playerId !== playerId) {
    return;
  }

  currentSpinId = null;
  nextStopReel = 5;
  waitingStopAck = false;
  stopAllAnimations();

  const { result } = payload;
  result.symbols.forEach((symbol, idx) => {
    setReelToSymbol(idx + 1, symbol, true);
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
  nextStopReel = 1;
  waitingStopAck = false;
  stopAllAnimations();
  resetReelSymbols();
  setMessage("已由後台重置，可重新開始");
  syncButtons();
});

socket.on("error:notice", (payload) => {
  if (payload && payload.message) {
    setMessage(payload.message, "error");
  }

  waitingStopAck = false;
  syncButtons();
});

initializeReels();
setConnection(socket.connected);
syncView();
