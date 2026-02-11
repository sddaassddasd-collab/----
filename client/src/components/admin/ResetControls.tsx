import type { GameMode } from "../../../../shared/types";

interface ResetControlsProps {
  mode: GameMode;
  totalClients: number;
  starting: boolean;
  resetting: boolean;
  onStartAll: () => void;
  onResetAll: () => void;
}

export default function ResetControls({
  mode,
  totalClients,
  starting,
  resetting,
  onStartAll,
  onResetAll
}: ResetControlsProps) {
  return (
    <section className="admin-reset-panel">
      <div className="admin-reset-stats">
        <p>連線人數：{totalClients}</p>
        <p>顯示方式：由上到下</p>
      </div>

      <div className="admin-reset-actions">
        <button type="button" className="admin-start-all-btn" disabled={mode !== "official" || starting} onClick={onStartAll}>
          {starting ? "啟動中..." : "全體開始"}
        </button>
        <button type="button" className="admin-reset-all-btn" disabled={mode !== "official" || resetting} onClick={onResetAll}>
          {resetting ? "重置中..." : "全部 Reset"}
        </button>
      </div>
    </section>
  );
}
