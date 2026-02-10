import { useEffect, useMemo, useState } from "react";
import type { ClientState, GameMode } from "../../../shared/types";
import { ensureSocketConnected, fetchSnapshot, getSocket, resetAllClients, resetOneClient, setAdminMode } from "../app/socket";
import ConfettiLayer from "../components/admin/ConfettiLayer";
import GridBoard, { type ClientEntry } from "../components/admin/GridBoard";
import ModeToggle from "../components/admin/ModeToggle";
import ResetControls from "../components/admin/ResetControls";

const PAGE_SIZE = 30;

interface NoticeState {
  text: string;
  isError: boolean;
}

function sortClientEntries(clients: Record<string, ClientState>): ClientEntry[] {
  return Object.entries(clients)
    .map(([socketId, state]) => ({ socketId, state }))
    .sort((a, b) => {
      const nameDiff = a.state.name.localeCompare(b.state.name, "zh-Hant");
      if (nameDiff !== 0) {
        return nameDiff;
      }
      return a.socketId.localeCompare(b.socketId);
    });
}

function paginateClientEntries(entries: ClientEntry[], page: number, pageSize = PAGE_SIZE): ClientEntry[] {
  const start = page * pageSize;
  return entries.slice(start, start + pageSize);
}

export default function AdminPage() {
  const [mode, setMode] = useState<GameMode>("practice");
  const [clients, setClients] = useState<Record<string, ClientState>>({});
  const [connected, setConnected] = useState(false);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [changingMode, setChangingMode] = useState(false);
  const [resettingAll, setResettingAll] = useState(false);
  const [confettiBurstCount, setConfettiBurstCount] = useState(0);

  const sortedClients = useMemo(() => sortClientEntries(clients), [clients]);
  const totalPages = Math.max(1, Math.ceil(sortedClients.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages - 1);
  const pageClients = useMemo(() => paginateClientEntries(sortedClients, safePage), [sortedClients, safePage]);

  useEffect(() => {
    if (safePage !== currentPage) {
      setCurrentPage(safePage);
    }
  }, [safePage, currentPage]);

  useEffect(() => {
    const socket = getSocket();
    let mounted = true;

    const showNotice = (text: string, isError = false) => {
      if (!mounted) {
        return;
      }
      setNotice({ text, isError });
    };

    const applySnapshot = (snapshot: { mode: GameMode; clients: Record<string, ClientState> }) => {
      if (!mounted) {
        return;
      }
      setMode(snapshot.mode);
      setClients(snapshot.clients);
    };

    async function syncSnapshot() {
      const snapshotAck = await fetchSnapshot();
      if (!mounted) {
        return;
      }

      if (!snapshotAck.ok) {
        showNotice(snapshotAck.error, true);
        return;
      }

      applySnapshot(snapshotAck.data.snapshot);
    }

    const handleConnect = () => {
      setConnected(true);
      showNotice("後台已連線");
      void syncSnapshot();
    };

    const handleDisconnect = () => {
      setConnected(false);
      showNotice("連線中斷，等待重連...", true);
    };

    const handleMode = (payload: { mode: GameMode }) => {
      if (!mounted) {
        return;
      }
      setMode(payload.mode);
    };

    const handleState = (payload: { snapshot: { mode: GameMode; clients: Record<string, ClientState> } }) => {
      applySnapshot(payload.snapshot);
    };

    const handleClientState = (payload: { socketId: string; state: ClientState }) => {
      if (!mounted) {
        return;
      }
      setClients((prev) => ({
        ...prev,
        [payload.socketId]: payload.state
      }));
    };

    const handleConfetti = (payload: {
      socketId: string;
      finalReels: readonly [string, string, string, string];
    }) => {
      if (!mounted) {
        return;
      }

      setConfettiBurstCount((prev) => prev + 1);

      // 如果快照尚未更新，先行標亮中獎 tile，避免視覺延遲。
      setClients((prev) => {
        const target = prev[payload.socketId];
        if (!target) {
          return prev;
        }

        return {
          ...prev,
          [payload.socketId]: {
            ...target,
            isWin: true,
            reels: payload.finalReels,
            finalReels: payload.finalReels
          }
        };
      });
    };

    const handleServerError = (payload: { message: string }) => {
      if (!mounted) {
        return;
      }
      showNotice(payload.message, true);
      setChangingMode(false);
      setResettingAll(false);
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("server:mode", handleMode);
    socket.on("server:state", handleState);
    socket.on("server:clientState", handleClientState);
    socket.on("server:confetti", handleConfetti);
    socket.on("server:error", handleServerError);

    async function bootstrap() {
      try {
        await ensureSocketConnected();
        if (!mounted) {
          return;
        }
        setConnected(true);
        await syncSnapshot();
      } catch {
        if (!mounted) {
          return;
        }
        showNotice("無法連線到伺服器", true);
      }
    }

    void bootstrap();

    return () => {
      mounted = false;
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("server:mode", handleMode);
      socket.off("server:state", handleState);
      socket.off("server:clientState", handleClientState);
      socket.off("server:confetti", handleConfetti);
      socket.off("server:error", handleServerError);
    };
  }, []);

  async function handleChangeMode(nextMode: GameMode) {
    if (changingMode || nextMode === mode) {
      return;
    }

    setChangingMode(true);
    const ack = await setAdminMode(nextMode);
    setChangingMode(false);

    if (!ack.ok) {
      setNotice({ text: ack.error, isError: true });
      return;
    }

    setMode(ack.data.mode);
    setNotice({ text: `已切換為 ${ack.data.mode === "official" ? "正式模式" : "練習模式"}`, isError: false });
  }

  async function handleResetAll() {
    if (resettingAll) {
      return;
    }

    setResettingAll(true);
    const ack = await resetAllClients();
    setResettingAll(false);

    if (!ack.ok) {
      setNotice({ text: ack.error, isError: true });
      return;
    }

    setNotice({ text: `已重置 ${ack.data.resetCount} 位使用者`, isError: false });
  }

  async function handleResetOne(socketId: string) {
    const ack = await resetOneClient(socketId);

    if (!ack.ok) {
      setNotice({ text: ack.error, isError: true });
      return;
    }

    setClients((prev) => ({
      ...prev,
      [socketId]: ack.data.state
    }));
    setNotice({ text: `已重置 ${ack.data.state.name}`, isError: false });
  }

  return (
    <main className="admin-page">
      <header className="admin-header">
        <div>
          <h1>玩家監控儀表板</h1>
          <p>每頁最多 30 格（6x5）</p>
        </div>
        <div className="admin-header-tags">
          <span className="admin-tag">模式：{mode === "official" ? "正式" : "練習"}</span>
          <span className={`admin-tag ${connected ? "ok" : "bad"}`}>{connected ? "連線中" : "離線"}</span>
        </div>
      </header>

      <div className="admin-control-wrap">
        <ModeToggle mode={mode} disabled={changingMode} onChangeMode={handleChangeMode} />
        <ResetControls
          mode={mode}
          totalClients={sortedClients.length}
          currentPage={safePage + 1}
          totalPages={totalPages}
          resetting={resettingAll}
          onResetAll={handleResetAll}
          onPrevPage={() => setCurrentPage((prev) => Math.max(0, prev - 1))}
          onNextPage={() => setCurrentPage((prev) => Math.min(totalPages - 1, prev + 1))}
        />
      </div>

      {notice ? <p className={`admin-notice ${notice.isError ? "error" : "ok"}`}>{notice.text}</p> : null}

      <GridBoard clients={pageClients} mode={mode} onResetOne={handleResetOne} />
      <ConfettiLayer burstCount={confettiBurstCount} />
    </main>
  );
}
