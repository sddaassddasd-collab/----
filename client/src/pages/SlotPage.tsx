import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ClientState, GameMode, ReelId, StopIndex } from "../../../shared/types";
import {
  ensureSocketConnected,
  getSocket,
  joinClient,
  pullSpin,
  resetClient,
  stopReel
} from "../app/socket";
import ResultModal from "../components/slot/ResultModal";
import SlotMachine from "../components/slot/SlotMachine";

const NAME_STORAGE_KEY = "slot_player_name";
const RECONNECT_TOKEN_STORAGE_KEY = "slot_reconnect_token";

export default function SlotPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<GameMode>("practice");
  const [clientState, setClientState] = useState<ClientState | null>(null);
  const [resultText, setResultText] = useState("");
  const [pendingPull, setPendingPull] = useState(false);
  const [waitingStop, setWaitingStop] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMessage, setModalMessage] = useState("");

  const welcomeName = useMemo(() => clientState?.name ?? localStorage.getItem(NAME_STORAGE_KEY) ?? "玩家", [clientState]);

  useEffect(() => {
    const socket = getSocket();
    let mounted = true;

    const handleConnect = () => {
      setConnected(true);
    };

    const handleDisconnect = () => {
      setConnected(false);
    };

    const handleMode = (payload: { mode: GameMode }) => {
      if (!mounted) {
        return;
      }
      setMode(payload.mode);
    };

    const isSelf = (socketId: string): boolean => {
      const currentId = socket.id;
      return Boolean(currentId && socketId === currentId);
    };

    const handleClientState = (payload: { socketId: string; state: ClientState }) => {
      if (!mounted || !isSelf(payload.socketId)) {
        return;
      }

      setClientState(payload.state);
    };

    const handleSnapshot = (payload: { snapshot: { mode: GameMode; clients: Record<string, ClientState> } }) => {
      if (!mounted) {
        return;
      }

      setMode(payload.snapshot.mode);
      const currentId = socket.id;
      if (!currentId) {
        return;
      }
      const self = payload.snapshot.clients[currentId];
      if (self) {
        setClientState(self);
      }
    };

    const handlePullResult = (payload: {
      socketId: string;
      finalReels: readonly [string, string, string, string];
      isWin: boolean;
      resultText: string;
      mode: GameMode;
      locked: boolean;
    }) => {
      if (!mounted || !isSelf(payload.socketId)) {
        return;
      }

      setResultText(payload.locked ? `${payload.resultText}（等待後台 reset）` : payload.resultText);

      if (payload.mode === "official") {
        const message = payload.isWin ? "恭喜中獎" : "太可惜了><";
        setModalMessage(message);
        setModalOpen(true);
      }
    };

    const handleError = (payload: { message: string }) => {
      if (!mounted) {
        return;
      }
      setError(payload.message);
      setPendingPull(false);
      setWaitingStop(false);
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("server:mode", handleMode);
    socket.on("server:clientState", handleClientState);
    socket.on("server:state", handleSnapshot);
    socket.on("server:pullResult", handlePullResult);
    socket.on("server:error", handleError);

    async function bootstrap() {
      const savedName = (localStorage.getItem(NAME_STORAGE_KEY) ?? "").trim();
      const savedReconnectToken = (localStorage.getItem(RECONNECT_TOKEN_STORAGE_KEY) ?? "").trim();
      if (!savedName) {
        navigate("/", { replace: true });
        return;
      }

      try {
        await ensureSocketConnected();
        if (!mounted) {
          return;
        }
        setConnected(true);

        const joinAck = await joinClient({
          name: savedName,
          reconnectToken: savedReconnectToken || undefined
        });
        if (!mounted) {
          return;
        }

        if (!joinAck.ok) {
          setError(joinAck.error);
          return;
        }

        setMode(joinAck.data.mode);
        setClientState(joinAck.data.state);
        localStorage.setItem(RECONNECT_TOKEN_STORAGE_KEY, joinAck.data.reconnectToken);
      } catch {
        if (!mounted) {
          return;
        }
        setError("無法連線到伺服器");
      }
    }

    void bootstrap();

    return () => {
      mounted = false;
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("server:mode", handleMode);
      socket.off("server:clientState", handleClientState);
      socket.off("server:state", handleSnapshot);
      socket.off("server:pullResult", handlePullResult);
      socket.off("server:error", handleError);
    };
  }, [navigate]);

  async function handlePull() {
    if (pendingPull || waitingStop) {
      return;
    }

    setError("");
    setResultText("");
    setPendingPull(true);

    const ack = await pullSpin();
    setPendingPull(false);

    if (!ack.ok) {
      setError(ack.error);
      return;
    }

    setClientState(ack.data.state);
  }

  async function handleStopReel(payload: { reelId: ReelId; stopIndex: StopIndex }) {
    if (pendingPull || waitingStop) {
      return;
    }

    setError("");
    setWaitingStop(true);

    const ack = await stopReel(payload);
    setWaitingStop(false);

    if (!ack.ok) {
      setError(ack.error);
      return;
    }

    setClientState(ack.data.state);

    if (ack.data.result) {
      setResultText(ack.data.result.locked ? `${ack.data.result.resultText}（等待後台 reset）` : ack.data.result.resultText);

      if (ack.data.result.mode === "official") {
        const message = ack.data.result.isWin ? "恭喜中獎" : "太可惜了><";
        setModalMessage(message);
        setModalOpen(true);
      }
    }
  }

  async function handleReset() {
    if (pendingPull || waitingStop) {
      return;
    }

    setError("");
    const ack = await resetClient();

    if (!ack.ok) {
      setError(ack.error);
      return;
    }

    setClientState(ack.data.state);
    setResultText("已重置，可再次 Pull");
  }

  return (
    <main className="slot-page">
      <header className="slot-header">
        <div>
          <h1>複象公場 拉霸</h1>
          <p>玩家：{welcomeName}</p>
        </div>
        <div className="status-tags">
          <span className="tag">模式：{mode === "official" ? "正式" : "練習"}</span>
          <span className={`tag ${connected ? "ok" : "bad"}`}>{connected ? "連線中" : "離線"}</span>
        </div>
      </header>

      <SlotMachine
        mode={mode}
        state={clientState}
        isConnected={connected}
        pendingPull={pendingPull}
        waitingStop={waitingStop}
        resultText={resultText}
        onPull={handlePull}
        onStopReel={handleStopReel}
        onReset={handleReset}
      />

      {error ? <p className="error-text">{error}</p> : null}

      <ResultModal open={modalOpen} message={modalMessage} onClose={() => setModalOpen(false)} />
    </main>
  );
}
