import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ensureSocketConnected, joinClient } from "../app/socket";

const NAME_STORAGE_KEY = "slot_player_name";
const RECONNECT_TOKEN_STORAGE_KEY = "slot_reconnect_token";

export default function JoinPage() {
  const navigate = useNavigate();
  const [name, setName] = useState(() => localStorage.getItem(NAME_STORAGE_KEY) ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("請先輸入姓名");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      await ensureSocketConnected();
      const savedReconnectToken = (localStorage.getItem(RECONNECT_TOKEN_STORAGE_KEY) ?? "").trim();
      const ack = await joinClient({
        name: trimmedName,
        reconnectToken: savedReconnectToken || undefined
      });

      if (!ack.ok) {
        setError(ack.error);
        setSubmitting(false);
        return;
      }

      localStorage.setItem(NAME_STORAGE_KEY, trimmedName);
      localStorage.setItem(RECONNECT_TOKEN_STORAGE_KEY, ack.data.reconnectToken);
      navigate("/slot", { replace: true });
    } catch {
      setError("連線失敗，請稍後再試");
      setSubmitting(false);
    }
  }

  return (
    <main className="join-page">
      <section className="join-card">
        <h1>複象公場 拉霸</h1>
        <p>輸入姓名後開始遊戲</p>

        <form className="join-form" onSubmit={handleSubmit}>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            type="text"
            maxLength={20}
            placeholder="請輸入姓名"
            required
          />
          <button type="submit" disabled={submitting}>
            {submitting ? "連線中..." : "進入遊戲"}
          </button>
        </form>

        {error ? <p className="error-text">{error}</p> : null}
      </section>
    </main>
  );
}
