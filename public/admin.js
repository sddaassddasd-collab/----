const socket = io({ autoConnect: false });

const TOTAL_REELS = 4;
const INDEX0_SYMBOLS = ["複", "象", "公", "場"];

const authPanel = document.getElementById("auth-panel");
const authForm = document.getElementById("auth-form");
const authTokenInput = document.getElementById("admin-token");
const loginMsg = document.getElementById("login-msg");

const dashboard = document.getElementById("dashboard");
const authMsg = document.getElementById("auth-msg");
const statsLine = document.getElementById("stats-line");
const gridEl = document.getElementById("grid");
const modePracticeBtn = document.getElementById("mode-practice");
const modeOfficialBtn = document.getElementById("mode-official");
const roundStartBtn = document.getElementById("round-start");
const roundResetBtn = document.getElementById("round-reset");
const rebindAllBtn = document.getElementById("rebind-all");
const confettiLayer = document.getElementById("confetti-layer");

let mode = "practice";
let authenticated = false;

const players = new Map();

function showMessage(text, isError = false) {
  if (!authMsg) {
    return;
  }
  authMsg.textContent = text;
  authMsg.style.color = isError ? "#b91c1c" : "#0f766e";
}

function showLoginMessage(text, isError = false) {
  if (!loginMsg) {
    return;
  }
  loginMsg.textContent = text;
  loginMsg.style.color = isError ? "#b91c1c" : "#0f766e";
}

function syncAuthView() {
  authPanel?.classList.toggle("hidden", authenticated);
  dashboard?.classList.toggle("hidden", !authenticated);
}

function toStateText(phase) {
  if (phase === "ready") return "待機";
  if (phase === "spinning") return "轉動中";
  if (phase === "locked") return "等待後台 reset";
  return "未知";
}

function progressFromState(state) {
  const reels = Array.isArray(state?.reels) ? state.reels : ["-", "-", "-", "-"];
  let correctCount = 0;
  let completedCount = 0;

  for (let index = 0; index < TOTAL_REELS; index += 1) {
    const symbol = reels[index];
    if (symbol && symbol !== "-") {
      completedCount += 1;
    }
    if (symbol === INDEX0_SYMBOLS[index]) {
      correctCount += 1;
    }
  }

  return {
    correctCount,
    completedCount,
    accuracy: Math.round((correctCount / TOTAL_REELS) * 100)
  };
}

function normalizeFinishedAt(state) {
  return typeof state?.finishedAt === "number" ? state.finishedAt : null;
}

function compareFinishedAtAsc(stateA, stateB) {
  const finishedAtA = normalizeFinishedAt(stateA);
  const finishedAtB = normalizeFinishedAt(stateB);

  if (finishedAtA === null && finishedAtB === null) {
    return 0;
  }
  if (finishedAtA === null) {
    return 1;
  }
  if (finishedAtB === null) {
    return -1;
  }
  return finishedAtA - finishedAtB;
}

function playersSorted() {
  return [...players.entries()].sort((a, b) => {
    const progressA = progressFromState(a[1]);
    const progressB = progressFromState(b[1]);

    if (progressA.accuracy !== progressB.accuracy) {
      return progressB.accuracy - progressA.accuracy;
    }

    if (progressA.completedCount !== progressB.completedCount) {
      return progressB.completedCount - progressA.completedCount;
    }

    const finishedAtDiff = compareFinishedAtAsc(a[1], b[1]);
    if (finishedAtDiff !== 0) {
      return finishedAtDiff;
    }

    const nameDiff = a[1].name.localeCompare(b[1].name, "zh-Hant");
    if (nameDiff !== 0) {
      return nameDiff;
    }
    return a[0].localeCompare(b[0]);
  });
}

function stateSymbols(state) {
  const symbols = Array.isArray(state.finalReels) ? state.finalReels : state.reels;
  const safeSymbols = Array.isArray(symbols) ? symbols : [];
  const normalized = [];

  for (let index = 0; index < TOTAL_REELS; index += 1) {
    const symbol = safeSymbols[index];
    normalized.push(typeof symbol === "string" && symbol ? symbol : "-");
  }

  return normalized;
}

function stateMessage(state) {
  if (state.phase === "locked" && !state.isWin) {
    return "未中獎，等待後台 reset";
  }
  if (state.phase === "locked" && state.isWin) {
    return "恭喜中獎，等待後台 reset";
  }
  if (state.isWin) {
    return "中獎";
  }
  return "";
}

function formatFinishedAt(value) {
  if (typeof value !== "number") {
    return "尚未完成";
  }

  const date = new Date(value);
  const milliseconds = String(date.getMilliseconds()).padStart(3, "0");
  return `${date.toLocaleString("zh-TW", { hour12: false })}.${milliseconds}`;
}

function handleAdminAckFailure(ack, fallbackError) {
  if (ack?.ok) {
    return false;
  }

  if (ack?.code === "UNAUTHORIZED") {
    applyUnauthorized(ack?.error || "授權已失效，請重新登入");
    return true;
  }

  showMessage(ack?.error || fallbackError, true);
  return true;
}

function requireAuthenticated() {
  if (authenticated) {
    return true;
  }
  applyUnauthorized("請先輸入 admin token 登入");
  return false;
}

function resetOne(socketId) {
  if (!requireAuthenticated()) {
    return;
  }

  socket.emit("admin:resetOne", socketId, (ack) => {
    handleAdminAckFailure(ack, "單人重置失敗");
  });
}

function createTile(socketId, state, rank) {
  const progress = progressFromState(state);
  const phaseText = toStateText(state.phase);
  const messageText = stateMessage(state);
  const tile = document.createElement("article");
  tile.className = "tile";
  if (state.isWin) {
    tile.classList.add("winner");
  }

  const mainEl = document.createElement("div");
  mainEl.className = "tile-main";

  const identityEl = document.createElement("div");
  identityEl.className = "tile-identity";

  const headingEl = document.createElement("div");
  headingEl.className = "tile-heading";

  const nameRow = document.createElement("div");
  nameRow.className = "tile-name-row";

  const rankEl = document.createElement("span");
  rankEl.className = "tile-rank";
  rankEl.textContent = `#${rank}`;

  const nameEl = document.createElement("div");
  nameEl.className = "tile-name";
  nameEl.textContent = state.name;

  nameRow.append(rankEl, nameEl);

  const phaseBadgeEl = document.createElement("span");
  phaseBadgeEl.className = `tile-phase-badge ${state.phase}`;
  phaseBadgeEl.textContent = phaseText;

  headingEl.append(nameRow, phaseBadgeEl);

  const idEl = document.createElement("div");
  idEl.className = "tile-id";
  idEl.textContent = `ID ${socketId.slice(0, 8)}`;

  const finishedAtEl = document.createElement("div");
  finishedAtEl.className = "tile-finished-at";
  finishedAtEl.textContent = `完成時間 ${formatFinishedAt(state.finishedAt)}`;

  const metaRowEl = document.createElement("div");
  metaRowEl.className = "tile-meta-row";
  metaRowEl.append(idEl, finishedAtEl);

  const phaseEl = document.createElement("div");
  phaseEl.className = "tile-state";
  phaseEl.textContent = `狀態：${phaseText}`;

  identityEl.append(headingEl, metaRowEl, phaseEl);

  const visualEl = document.createElement("div");
  visualEl.className = "tile-visual";

  const symbolEl = document.createElement("div");
  symbolEl.className = "tile-symbols";
  const symbols = stateSymbols(state);
  for (let index = 0; index < TOTAL_REELS; index += 1) {
    const symbolItemEl = document.createElement("span");
    symbolItemEl.className = "tile-symbol-chip";
    symbolItemEl.textContent = symbols[index];
    if (symbols[index] === INDEX0_SYMBOLS[index]) {
      symbolItemEl.classList.add("hit");
    }
    symbolEl.appendChild(symbolItemEl);
  }

  const summaryEl = document.createElement("div");
  summaryEl.className = "tile-summary";

  const accuracyEl = document.createElement("div");
  accuracyEl.className = "tile-pill tile-accuracy";
  accuracyEl.textContent = `正確率 ${progress.accuracy}% (${progress.correctCount}/${TOTAL_REELS}) | 已完成 ${progress.completedCount}/${TOTAL_REELS}`;
  summaryEl.appendChild(accuracyEl);

  if (messageText) {
    const msgEl = document.createElement("div");
    msgEl.className = "tile-pill tile-msg";
    msgEl.textContent = messageText;
    summaryEl.appendChild(msgEl);
  }

  visualEl.append(symbolEl, summaryEl);

  const actionEl = document.createElement("div");
  actionEl.className = "tile-actions";

  const resetBtn = document.createElement("button");
  resetBtn.className = "tile-reset";
  resetBtn.textContent = "Reset 此人";
  resetBtn.disabled = mode !== "official";
  resetBtn.addEventListener("click", () => {
    resetOne(socketId);
  });
  actionEl.appendChild(resetBtn);

  mainEl.append(identityEl, visualEl, actionEl);
  tile.append(mainEl);
  return tile;
}

function countStartablePlayers() {
  let readyCount = 0;
  for (const state of players.values()) {
    if (state.phase === "ready") {
      readyCount += 1;
    }
  }
  return readyCount;
}

function renderModeButtons() {
  modePracticeBtn?.classList.toggle("active", mode === "practice");
  modeOfficialBtn?.classList.toggle("active", mode === "official");
  const startableCount = countStartablePlayers();
  if (roundStartBtn) {
    roundStartBtn.disabled = mode !== "official" || !authenticated || startableCount <= 0;
    roundStartBtn.textContent = startableCount > 0 ? `全體開始（${startableCount}）` : "全體開始";
  }
  if (roundResetBtn) {
    roundResetBtn.disabled = mode !== "official" || !authenticated;
    roundResetBtn.textContent = "全部 Reset";
  }
  if (rebindAllBtn) {
    rebindAllBtn.disabled = !authenticated;
  }
}

function renderGrid() {
  const all = playersSorted();

  if (gridEl) {
    gridEl.replaceChildren();

    all.forEach(([socketId, state], index) => {
      gridEl.appendChild(createTile(socketId, state, index + 1));
    });
  }

  if (statsLine) {
    statsLine.textContent = `連線玩家 ${all.length} 人 | 模式 ${mode === "official" ? "正式" : "練習"}`;
  }
  renderModeButtons();
}

function burstConfetti() {
  const colors = ["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#eab308"];

  for (let i = 0; i < 70; i += 1) {
    const piece = document.createElement("span");
    piece.className = "confetti-piece";
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDuration = `${1.5 + Math.random() * 1.8}s`;
    piece.style.transform = `rotate(${Math.random() * 360}deg)`;
    confettiLayer?.appendChild(piece);

    setTimeout(() => {
      piece.remove();
    }, 3500);
  }
}

function applySnapshot(snapshot) {
  mode = snapshot.mode;
  players.clear();
  Object.entries(snapshot.clients).forEach(([socketId, state]) => {
    players.set(socketId, state);
  });
  renderGrid();
}

function applyUnauthorized(message) {
  authenticated = false;
  players.clear();
  mode = "practice";
  if (socket.connected) {
    socket.disconnect();
  }
  syncAuthView();
  showLoginMessage(message || "授權已失效，請重新登入", true);
  showMessage("", false);
  renderGrid();
}

async function restoreSession() {
  try {
    const response = await fetch("/admin/session", { credentials: "same-origin" });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      applyUnauthorized("無法確認登入狀態，請稍後再試");
      return;
    }

    if (!payload.tokenConfigured) {
      applyUnauthorized("伺服器尚未設定 ADMIN_TOKEN，請先設定環境變數後重啟。");
      return;
    }

    if (!payload.authenticated) {
      authenticated = false;
      players.clear();
      mode = "practice";
      syncAuthView();
      showLoginMessage("請輸入 admin token 登入。");
      renderGrid();
      return;
    }

    authenticated = true;
    syncAuthView();
    showLoginMessage("");
    if (!socket.connected) {
      socket.connect();
    }
  } catch (_error) {
    applyUnauthorized("無法連線到伺服器，請稍後再試");
  }
}

async function submitAuth(event) {
  event.preventDefault();

  const token = typeof authTokenInput?.value === "string" ? authTokenInput.value.trim() : "";
  if (!token) {
    showLoginMessage("請輸入 admin token", true);
    return;
  }

  showLoginMessage("登入中...");
  try {
    const response = await fetch("/admin/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      credentials: "same-origin",
      body: JSON.stringify({ token })
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      showLoginMessage(payload?.error || "登入失敗，請稍後再試", true);
      return;
    }

    authenticated = true;
    if (authTokenInput) {
      authTokenInput.value = "";
    }
    showLoginMessage("");
    syncAuthView();
    showMessage("已登入");
    if (socket.connected) {
      socket.disconnect();
    }
    socket.connect();
  } catch (_error) {
    showLoginMessage("登入失敗，請稍後再試", true);
  }
}

modePracticeBtn?.addEventListener("click", () => {
  if (!requireAuthenticated()) {
    return;
  }

  socket.emit("admin:setMode", "practice", (ack) => {
    handleAdminAckFailure(ack, "切換練習模式失敗");
  });
});

modeOfficialBtn?.addEventListener("click", () => {
  if (!requireAuthenticated()) {
    return;
  }

  socket.emit("admin:setMode", "official", (ack) => {
    handleAdminAckFailure(ack, "切換正式模式失敗");
  });
});

roundStartBtn?.addEventListener("click", () => {
  if (!requireAuthenticated()) {
    return;
  }

  socket.emit("admin:startAll", (ack) => {
    if (handleAdminAckFailure(ack, "全體開始失敗")) {
      return;
    }
    showMessage(`已同步開始 ${ack.data.startedCount} 位玩家`);
  });
});

roundResetBtn?.addEventListener("click", () => {
  if (!requireAuthenticated()) {
    return;
  }

  socket.emit("admin:resetAll", (ack) => {
    if (handleAdminAckFailure(ack, "全部重置失敗")) {
      return;
    }
    showMessage(`已重置 ${ack.data.resetCount} 位玩家`);
  });
});

rebindAllBtn?.addEventListener("click", () => {
  if (!requireAuthenticated()) {
    return;
  }

  socket.emit("admin:rebindAll", (ack) => {
    if (handleAdminAckFailure(ack, "全部重綁失敗")) {
      return;
    }
    showMessage(`已要求 ${ack.data.rebindCount} 位玩家重新綁定姓名`);
  });
});

window.addEventListener("resize", renderGrid);

authForm?.addEventListener("submit", submitAuth);

socket.on("connect", () => {
  showMessage("已連線");
  socket.emit("state:get", (ack) => {
    if (ack?.ok) {
      applySnapshot(ack.data.snapshot);
      return;
    }
    showMessage("同步狀態失敗", true);
  });
});

socket.on("disconnect", () => {
  if (authenticated) {
    showMessage("連線中斷，等待重連...", true);
  }
});

socket.on("server:state", (payload) => {
  applySnapshot(payload.snapshot);
});

socket.on("server:mode", (payload) => {
  mode = payload.mode;
  renderGrid();
});

socket.on("server:clientState", (payload) => {
  players.set(payload.socketId, payload.state);
  renderGrid();
});

socket.on("server:confetti", () => {
  burstConfetti();
});

socket.on("server:error", (payload) => {
  if (!payload?.message) {
    return;
  }
  showMessage(payload.message, true);
});

syncAuthView();
renderGrid();
restoreSession();
