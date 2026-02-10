const socket = io();

const PAGE_SIZE = 30;
const MAX_COLS = 6;
const MAX_ROWS = 5;
const TOTAL_REELS = 4;
const INDEX0_SYMBOLS = ["複", "象", "公", "場"];

const dashboard = document.getElementById("dashboard");
const authMsg = document.getElementById("auth-msg");
const statsLine = document.getElementById("stats-line");
const gridEl = document.getElementById("grid");
const modePracticeBtn = document.getElementById("mode-practice");
const modeOfficialBtn = document.getElementById("mode-official");
const roundResetBtn = document.getElementById("round-reset");
const prevPageBtn = document.getElementById("prev-page");
const nextPageBtn = document.getElementById("next-page");
const pageInfo = document.getElementById("page-info");
const confettiLayer = document.getElementById("confetti-layer");

let mode = "practice";
let currentPage = 0;

const players = new Map();

function showMessage(text, isError = false) {
  if (!authMsg) {
    return;
  }
  authMsg.textContent = text;
  authMsg.style.color = isError ? "#b91c1c" : "#0f766e";
}

function toStateText(phase) {
  if (phase === "ready") return "待機";
  if (phase === "spinning") return "轉動中";
  if (phase === "locked") return "等待後台 reset";
  return "未知";
}

function chooseGrid(count, viewportAspect = 16 / 9) {
  if (count <= 0) {
    return { rows: 1, cols: 1 };
  }

  let best = { rows: 1, cols: 1, score: Number.POSITIVE_INFINITY };

  for (let cols = 1; cols <= MAX_COLS; cols += 1) {
    const rows = Math.ceil(count / cols);
    if (rows > MAX_ROWS) {
      continue;
    }

    const empty = rows * cols - count;
    const aspectDiff = Math.abs(cols / rows - viewportAspect);
    const score = empty * 100 + aspectDiff;

    if (score < best.score) {
      best = { rows, cols, score };
    }
  }

  return { rows: best.rows, cols: best.cols };
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

    const nameDiff = a[1].name.localeCompare(b[1].name, "zh-Hant");
    if (nameDiff !== 0) {
      return nameDiff;
    }
    return a[0].localeCompare(b[0]);
  });
}

function pagedPlayers() {
  const all = playersSorted();
  const totalPages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
  currentPage = Math.min(Math.max(0, currentPage), totalPages - 1);

  const start = currentPage * PAGE_SIZE;
  const pageItems = all.slice(start, start + PAGE_SIZE);

  return {
    all,
    totalPages,
    pageItems
  };
}

function stateSymbols(state) {
  const symbols = state.finalReels || state.reels;
  if (!Array.isArray(symbols)) {
    return "- - - -";
  }
  return symbols.join(" ");
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

function resetOne(socketId) {
  socket.emit("admin:resetOne", socketId, (ack) => {
    if (ack?.ok) {
      return;
    }
    showMessage(ack?.error || "單人重置失敗", true);
  });
}

function createTile(socketId, state) {
  const progress = progressFromState(state);
  const tile = document.createElement("article");
  tile.className = "tile";
  if (state.isWin) {
    tile.classList.add("winner");
  }

  const nameEl = document.createElement("div");
  nameEl.className = "tile-name";
  nameEl.textContent = state.name;

  const idEl = document.createElement("div");
  idEl.className = "tile-id";
  idEl.textContent = `ID ${socketId.slice(0, 8)}`;

  const phaseEl = document.createElement("div");
  phaseEl.className = "tile-state";
  phaseEl.textContent = toStateText(state.phase);

  const symbolEl = document.createElement("div");
  symbolEl.className = "tile-symbols";
  symbolEl.textContent = stateSymbols(state);

  const accuracyEl = document.createElement("div");
  accuracyEl.className = "tile-accuracy";
  accuracyEl.textContent = `正確率 ${progress.accuracy}% (${progress.correctCount}/${TOTAL_REELS}) | 已完成 ${progress.completedCount}/${TOTAL_REELS}`;

  const msgEl = document.createElement("div");
  msgEl.className = "tile-msg";
  msgEl.textContent = stateMessage(state);

  const resetBtn = document.createElement("button");
  resetBtn.className = "tile-reset";
  resetBtn.textContent = "Reset 此人";
  resetBtn.disabled = mode !== "official";
  resetBtn.addEventListener("click", () => {
    resetOne(socketId);
  });

  tile.append(nameEl, idEl, phaseEl, symbolEl, accuracyEl, msgEl, resetBtn);
  return tile;
}

function renderModeButtons() {
  modePracticeBtn.classList.toggle("active", mode === "practice");
  modeOfficialBtn.classList.toggle("active", mode === "official");
  roundResetBtn.disabled = mode !== "official";
  roundResetBtn.textContent = "全部 Reset";
}

function renderGrid() {
  const { all, totalPages, pageItems } = pagedPlayers();
  const viewportAspect = window.innerWidth / Math.max(window.innerHeight, 1);
  const { rows, cols } = chooseGrid(Math.max(pageItems.length, 1), viewportAspect);

  gridEl.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
  gridEl.style.gridTemplateRows = `repeat(${rows}, minmax(0, 1fr))`;
  gridEl.replaceChildren();

  pageItems.forEach(([socketId, state]) => {
    gridEl.appendChild(createTile(socketId, state));
  });

  statsLine.textContent = `連線玩家 ${all.length} 人 | 模式 ${mode === "official" ? "正式" : "練習"}`;
  pageInfo.textContent = `第 ${currentPage + 1} / ${totalPages} 頁`;
  prevPageBtn.disabled = currentPage <= 0;
  nextPageBtn.disabled = currentPage >= totalPages - 1;
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
    confettiLayer.appendChild(piece);

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

modePracticeBtn.addEventListener("click", () => {
  socket.emit("admin:setMode", "practice", (ack) => {
    if (ack?.ok) {
      return;
    }
    showMessage(ack?.error || "切換練習模式失敗", true);
  });
});

modeOfficialBtn.addEventListener("click", () => {
  socket.emit("admin:setMode", "official", (ack) => {
    if (ack?.ok) {
      return;
    }
    showMessage(ack?.error || "切換正式模式失敗", true);
  });
});

roundResetBtn.addEventListener("click", () => {
  socket.emit("admin:resetAll", (ack) => {
    if (!ack?.ok) {
      showMessage(ack?.error || "全部重置失敗", true);
      return;
    }
    showMessage(`已重置 ${ack.data.resetCount} 位玩家`);
  });
});

prevPageBtn.addEventListener("click", () => {
  currentPage = Math.max(0, currentPage - 1);
  renderGrid();
});

nextPageBtn.addEventListener("click", () => {
  currentPage += 1;
  renderGrid();
});

window.addEventListener("resize", renderGrid);

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
  showMessage("連線中斷，等待重連...", true);
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

dashboard.classList.remove("hidden");
renderGrid();
