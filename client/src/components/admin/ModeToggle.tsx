import type { GameMode } from "../../../../shared/types";

interface ModeToggleProps {
  mode: GameMode;
  disabled?: boolean;
  onChangeMode: (mode: GameMode) => void;
}

export default function ModeToggle({ mode, disabled = false, onChangeMode }: ModeToggleProps) {
  return (
    <section className="admin-mode-panel">
      <h2>模式切換</h2>
      <div className="admin-mode-toggle">
        <button
          type="button"
          className={`admin-mode-btn ${mode === "practice" ? "active" : ""}`}
          disabled={disabled}
          onClick={() => onChangeMode("practice")}
        >
          Practice
        </button>
        <button
          type="button"
          className={`admin-mode-btn ${mode === "official" ? "active" : ""}`}
          disabled={disabled}
          onClick={() => onChangeMode("official")}
        >
          Official
        </button>
      </div>
    </section>
  );
}
