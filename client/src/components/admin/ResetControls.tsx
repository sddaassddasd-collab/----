import type { GameMode } from "../../../../shared/types";

interface ResetControlsProps {
  mode: GameMode;
  totalClients: number;
  currentPage: number;
  totalPages: number;
  starting: boolean;
  resetting: boolean;
  onStartAll: () => void;
  onResetAll: () => void;
  onPrevPage: () => void;
  onNextPage: () => void;
}

export default function ResetControls({
  mode,
  totalClients,
  currentPage,
  totalPages,
  starting,
  resetting,
  onStartAll,
  onResetAll,
  onPrevPage,
  onNextPage
}: ResetControlsProps) {
  return (
    <section className="admin-reset-panel">
      <div className="admin-reset-stats">
        <p>連線人數：{totalClients}</p>
        <p>
          第 {currentPage} / {totalPages} 頁
        </p>
      </div>

      <div className="admin-reset-actions">
        <button type="button" className="admin-start-all-btn" disabled={mode !== "official" || starting} onClick={onStartAll}>
          {starting ? "啟動中..." : "全體開始"}
        </button>
        <button type="button" className="admin-reset-all-btn" disabled={mode !== "official" || resetting} onClick={onResetAll}>
          {resetting ? "重置中..." : "全部 Reset"}
        </button>
        <button type="button" className="admin-page-btn" disabled={currentPage <= 1} onClick={onPrevPage}>
          上一頁
        </button>
        <button type="button" className="admin-page-btn" disabled={currentPage >= totalPages} onClick={onNextPage}>
          下一頁
        </button>
      </div>
    </section>
  );
}
