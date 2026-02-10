const socket = io();

const REELS = [
  { reelId: 1, direction: "up_to_down", symbols: ["複", "復", "附", "負", "腹"] },
  { reelId: 2, direction: "down_to_up", symbols: ["象", "向", "像", "相", "項"] },
  { reelId: 3, direction: "up_to_down", symbols: ["公", "工", "攻", "功", "恭"] },
  { reelId: 4, direction: "down_to_up", symbols: ["場", "廠", "昶", "敞", "厂"] }
];

const EMPTY_REELS = ["-", "-", "-", "-"];
const ITEM_HEIGHT = 48;
const RECONNECT_TOKEN_STORAGE_KEY = "slot_reconnect_token";

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

let joined = false;
let joining = false;
let pendingPull = false;
let waitingStopAck = false;
let mode = "practice";
let playerName = localStorage.getItem("slot_player_name") || "";
let reconnectToken = localStorage.getItem(RECONNECT_TOKEN_STORAGE_KEY) || "";
let ownState = null;
let nextStopReel = 1;

const reelRuntime = {
  1: { timer: null, position: 5, trackEl: document.getElementById("reel-track-1") },
  2: { timer: null, position: 5, trackEl: document.getElementById("reel-track-2") },
  3: { timer: null, position: 5, trackEl: document.getElementById("reel-track-3") },
  4: { timer: null, position: 5, trackEl: document.getElementById("reel-track-4") }
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

function getPhase() {
  return ownState?.phase || "ready";
}

function applyReelTransform(reelId, withTransition = false) {
  const runtime = reelRuntime[reelId];
  if (!runtime.trackEl) {
    return;
  }

  runtime.trackEl.style.transition = withTransition
    ? "transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1)"
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

function currentStopIndex(reelId) {
  const runtime = reelRuntime[reelId];
  const symbolCount = REELS[reelId - 1].symbols.length;
  const nearest = Math.round(runtime.position);
  return ((nearest % symbolCount) + symbolCount) % symbolCount;
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
  const symbolCount = reel.symbols.length;

  for (let index = 0; index < repeated.length; index += 1) {
    const symbol = repeated[index];
    const cell = document.createElement("div");
    cell.className = "reel-item";
    if (index % symbolCount === 0) {
      cell.classList.add("reel-item-index0");
    }
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

function startSpinAnimation() {
  setMessage("");

  for (const reel of REELS) {
    const runtime = reelRuntime[reel.reelId];
    if (runtime.timer) {
      clearInterval(runtime.timer);
    }

    const step = reel.direction === "up_to_down" ? 0.3 : -0.3;
    runtime.timer = setInterval(() => {
      runtime.position += step;
      normalizePosition(reel.reelId);
      applyReelTransform(reel.reelId, false);
    }, 34 + reel.reelId * 5);
  }
}

function renderReelsByState(state) {
  const target = state.finalReels || state.reels;
  if (!Array.isArray(target)) {
    resetReelSymbols();
    return;
  }

  if (target.every((symbol) => symbol === "-")) {
    resetReelSymbols();
    return;
  }

  for (let i = 0; i < target.length; i += 1) {
    setReelToSymbol(i + 1, target[i], false);
  }
}

function hasRunningReel() {
  return Object.values(reelRuntime).some((runtime) => Boolean(runtime.timer));
}

function nextStopFromReels(reels) {
  for (let idx = 0; idx < reels.length; idx += 1) {
    if (reels[idx] === "-") {
      return idx + 1;
    }
  }
  return 5;
}

function syncButtons() {
  const connected = socket.connected;
  const phase = getPhase();
  const canStop = Boolean(
    joined && connected && phase === "spinning" && nextStopReel <= 4 && !pendingPull && !waitingStopAck
  );

  spinBtn.disabled = !joined || !connected || pendingPull || waitingStopAck || phase !== "ready";
  stopNextBtn.disabled = !canStop;
  resetBtn.disabled = !joined || !connected || pendingPull || waitingStopAck || phase === "spinning" || mode !== "practice";

  if (phase === "spinning" && pendingPull) {
    stopNextBtn.textContent = "啟動中...";
  } else if (phase === "spinning" && waitingStopAck) {
    stopNextBtn.textContent = `停止第 ${nextStopReel} 欄...`;
  } else if (phase === "spinning" && nextStopReel <= 4) {
    stopNextBtn.textContent = `停止第 ${nextStopReel} 欄`;
  } else if (nextStopReel > 4) {
    stopNextBtn.textContent = "停止完成";
  } else {
    stopNextBtn.textContent = "停止";
  }
}

function syncView() {
  modeBadge.textContent = toModeText(mode);

  if (!joined) {
    nameScreen.classList.remove("hidden");
    gameScreen.classList.add("hidden");
    syncButtons();
    return;
  }

  nameScreen.classList.add("hidden");
  gameScreen.classList.remove("hidden");
  welcomeText.textContent = `玩家：${ownState?.name || playerName}`;
  syncButtons();
}

function applyClientState(state) {
  ownState = state;

  if (state.phase === "spinning") {
    if (!hasRunningReel()) {
      startSpinAnimation();
    }

    nextStopReel = nextStopFromReels(state.reels);
    for (let index = 0; index < state.reels.length; index += 1) {
      const symbol = state.reels[index];
      if (symbol !== "-") {
        stopReelAnimation(index + 1, symbol);
      }
    }
  } else {
    pendingPull = false;
    waitingStopAck = false;
    nextStopReel = 1;
    stopAllAnimations();
    renderReelsByState(state);
  }

  if (state.phase === "locked" && mode === "official") {
    const lockedText = state.isWin ? "恭喜中獎（等待後台 reset）" : "太可惜了><（等待後台 reset）";
    setMessage(lockedText);
  }

  syncView();
}

function applySnapshot(snapshot) {
  if (!snapshot) {
    return;
  }

  mode = snapshot.mode;
  const mine = snapshot.clients?.[socket.id];
  if (joined && mine) {
    applyClientState(mine);
    return;
  }

  syncView();
}

function joinWithName(name) {
  if (joining) {
    return;
  }

  const trimmed = name.trim();
  if (!trimmed) {
    setMessage("請先輸入姓名", "error");
    return;
  }

  joining = true;
  socket.emit(
    "client:join",
    {
      name: trimmed,
      reconnectToken: reconnectToken || undefined
    },
    (ack) => {
      joining = false;

      if (!ack?.ok) {
        setMessage(ack?.error || "加入失敗，請稍後再試", "error");
        return;
      }

      joined = true;
      mode = ack.data.mode;
      playerName = trimmed;
      reconnectToken = typeof ack.data.reconnectToken === "string" ? ack.data.reconnectToken : reconnectToken;
      localStorage.setItem("slot_player_name", playerName);
      localStorage.setItem(RECONNECT_TOKEN_STORAGE_KEY, reconnectToken);

      applyClientState(ack.data.state);
      socket.emit("state:get", (snapshotAck) => {
        if (snapshotAck?.ok) {
          applySnapshot(snapshotAck.data.snapshot);
        }
      });
    }
  );
}

function submitJoin(event) {
  event.preventDefault();
  joinWithName(nameInput.value || "");
}

function forceRebind(message) {
  joined = false;
  joining = false;
  pendingPull = false;
  waitingStopAck = false;
  nextStopReel = 1;
  ownState = null;
  playerName = "";
  reconnectToken = "";
  nameInput.value = "";
  localStorage.removeItem("slot_player_name");
  localStorage.removeItem(RECONNECT_TOKEN_STORAGE_KEY);
  stopAllAnimations();
  resetReelSymbols();
  setMessage(message || "後台已重設，請重新輸入姓名", "error");
  syncView();
}

function emitSpin() {
  if (!joined || pendingPull || waitingStopAck || getPhase() !== "ready") {
    return;
  }

  const previousState = ownState;

  nextStopReel = 1;
  pendingPull = true;
  waitingStopAck = false;
  ownState = {
    name: previousState?.name || playerName || "玩家",
    phase: "spinning",
    reels: [...EMPTY_REELS],
    finalReels: null,
    isWin: false
  };

  startSpinAnimation();
  syncButtons();

  socket.emit("client:pull", (ack) => {
    pendingPull = false;

    if (!ack?.ok) {
      ownState = previousState;
      stopAllAnimations();
      if (ownState) {
        renderReelsByState(ownState);
      }
      setMessage(ack?.error || "拉霸失敗，請稍後再試", "error");
      syncView();
      return;
    }

    applyClientState(ack.data.state);
  });
}

function emitReset() {
  if (!joined) {
    return;
  }

  socket.emit("client:reset", (ack) => {
    if (!ack?.ok) {
      setMessage(ack?.error || "重置失敗", "error");
      return;
    }

    applyClientState(ack.data.state);
    setMessage("已重置，可重新開始");
  });
}

function emitStopNext() {
  if (getPhase() !== "spinning") {
    return;
  }
  if (pendingPull || waitingStopAck || nextStopReel > 4) {
    return;
  }

  const reelId = nextStopReel;
  const stopIndex = currentStopIndex(reelId);
  waitingStopAck = true;
  syncButtons();

  socket.emit("client:stopReel", { reelId, stopIndex }, (ack) => {
    waitingStopAck = false;

    if (!ack?.ok) {
      setMessage(ack?.error || "停止失敗，請重試", "error");
      syncButtons();
      return;
    }

    stopReelAnimation(reelId, ack.data.symbol);
    nextStopReel = Math.max(nextStopReel, reelId + 1);

    applyClientState(ack.data.state);

    if (ack.data.completed && ack.data.result) {
      const suffix = ack.data.result.locked ? "（等待後台 reset）" : "";
      setMessage(`${ack.data.result.resultText}${suffix}`);
    }

    syncButtons();
  });
}

nameForm.addEventListener("submit", submitJoin);
spinBtn.addEventListener("click", emitSpin);
stopNextBtn.addEventListener("click", emitStopNext);
resetBtn.addEventListener("click", emitReset);

socket.on("connect", () => {
  setConnection(true);

  if (playerName) {
    joinWithName(playerName);
  } else {
    syncView();
  }
});

socket.on("disconnect", () => {
  setConnection(false);
  joined = false;
  joining = false;
  pendingPull = false;
  waitingStopAck = false;
  nextStopReel = 1;
  ownState = null;
  stopAllAnimations();
  syncView();
});

socket.on("server:state", (payload) => {
  applySnapshot(payload.snapshot);
});

socket.on("server:mode", (payload) => {
  mode = payload.mode;
  syncView();
});

socket.on("server:clientState", (payload) => {
  if (payload.socketId !== socket.id) {
    return;
  }
  joined = true;
  applyClientState(payload.state);
});

socket.on("server:pullResult", (payload) => {
  if (payload.socketId !== socket.id) {
    return;
  }

  const suffix = payload.locked ? "（等待後台 reset）" : "";
  setMessage(`${payload.resultText}${suffix}`);
  syncButtons();
});

socket.on("server:error", (payload) => {
  if (payload?.message) {
    setMessage(payload.message, "error");
  }

  pendingPull = false;
  waitingStopAck = false;
  syncButtons();
});

socket.on("server:forceRebind", (payload) => {
  forceRebind(payload?.message);
});

initializeReels();
setConnection(socket.connected);
syncView();
