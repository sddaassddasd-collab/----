const socket = io();

const PAGE_SIZE = 30;
const MAX_COLS = 6;
const MAX_ROWS = 5;

const authPanel = document.getElementById("auth-panel");
const dashboard = document.getElementById("dashboard");
const authForm = document.getElementById("auth-form");
const tokenInput = document.getElementById("token-input");
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

let authed = false;
let mode = "practice";
let roundId = "";
let currentPage = 0;

const players = new Map();

function toStateText(state) {
  if (state === "ready") return "待機";
  if (state === "spinning") return "轉動中";
  if (state === "result") return "已完成";
  if (state === "locked_wait_admin") return "等待後台 reset";
  return "未就緒";
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

function connectedPlayersSorted() {
  return [...players.values()]
    .filter((p) => p.connected)
    .sort((a, b) => {
      if (a.connectedAt !== b.connectedAt) {
        return a.connectedAt - b.connectedAt;
      }
      return a.name.localeCompare(b.name, "zh-Hant");
    });
}

function pagedPlayers() {
  const all = connectedPlayersSorted();
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

function createTile(player) {
  const tile = document.createElement("article");
  tile.className = "tile";
  if (player.highlightedWinner) {
    tile.classList.add("winner");
  }

  const nameEl = document.createElement("div");
  nameEl.className = "tile-name";
  nameEl.textContent = player.name;

  const stateEl = document.createElement("div");
  stateEl.className = "tile-state";
  stateEl.textContent = toStateText(player.state);

  const symbolEl = document.createElement("div");
  symbolEl.className = "tile-symbols";
  symbolEl.textContent = player.lastResult ? player.lastResult.symbols.join(" ") : "- - - -";

  const msgEl = document.createElement("div");
  msgEl.className = "tile-msg";
  if (player.lastResult?.message) {
    msgEl.textContent = player.lastResult.message;
  } else if (player.lastResult?.isJackpot) {
    msgEl.textContent = "練習中獎";
  } else {
    msgEl.textContent = "";
  }

  tile.append(nameEl, stateEl, symbolEl, msgEl);
  return tile;
}

function renderModeButtons() {
  modePracticeBtn.classList.toggle("active", mode === "practice");
  modeOfficialBtn.classList.toggle("active", mode === "official");
  roundResetBtn.disabled = mode !== "official";
}

function renderGrid() {
  if (!authed) {
    return;
  }

  const { all, totalPages, pageItems } = pagedPlayers();
  const viewportAspect = window.innerWidth / Math.max(window.innerHeight, 1);
  const { rows, cols } = chooseGrid(Math.max(pageItems.length, 1), viewportAspect);

  gridEl.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
  gridEl.style.gridTemplateRows = `repeat(${rows}, minmax(0, 1fr))`;
  gridEl.replaceChildren();

  pageItems.forEach((player) => {
    gridEl.appendChild(createTile(player));
  });

  statsLine.textContent = `連線玩家 ${all.length} 人 | Round ${roundId.slice(0, 8)} | 模式 ${mode === "official" ? "正式" : "練習"}`;
  pageInfo.textContent = `第 ${currentPage + 1} / ${totalPages} 頁`;

  prevPageBtn.disabled = currentPage <= 0;
  nextPageBtn.disabled = currentPage >= totalPages - 1;

  renderModeButtons();
}

function showAuthMessage(text, isError = true) {
  authMsg.textContent = text;
  authMsg.style.color = isError ? "#b91c1c" : "#0f766e";
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

authForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const token = tokenInput.value.trim();
  if (!token) {
    showAuthMessage("請輸入 token");
    return;
  }

  socket.emit("admin:auth", { token }, (ack) => {
    if (!ack?.ok) {
      showAuthMessage("登入失敗，請檢查 token");
      return;
    }

    authed = true;
    authPanel.classList.add("hidden");
    dashboard.classList.remove("hidden");
    showAuthMessage("", false);
    socket.emit("admin:sync:request");
  });
});

modePracticeBtn.addEventListener("click", () => {
  socket.emit("admin:mode:set", { mode: "practice" });
});

modeOfficialBtn.addEventListener("click", () => {
  socket.emit("admin:mode:set", { mode: "official" });
});

roundResetBtn.addEventListener("click", () => {
  socket.emit("admin:round:reset");
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

socket.on("state:snapshot", (snapshot) => {
  mode = snapshot.mode;
  roundId = snapshot.round.roundId;

  players.clear();
  Object.values(snapshot.players).forEach((player) => {
    players.set(player.playerId, player);
  });

  renderGrid();
});

socket.on("player:upsert", (player) => {
  players.set(player.playerId, player);
  renderGrid();
});

socket.on("player:removed", (payload) => {
  players.delete(payload.playerId);
  renderGrid();
});

socket.on("mode:changed", (payload) => {
  mode = payload.mode;
  roundId = payload.roundId;
  renderGrid();
});

socket.on("round:reset", (payload) => {
  roundId = payload.roundId;
  currentPage = 0;
  renderGrid();
});

socket.on("winner:highlight", (payload) => {
  const player = players.get(payload.playerId);
  if (player) {
    player.highlightedWinner = true;
  }
  renderGrid();
});

socket.on("ui:confetti", () => {
  burstConfetti();
});

socket.on("error:notice", (payload) => {
  if (!authed || !payload?.message) {
    return;
  }
  showAuthMessage(payload.message);
});

renderGrid();
