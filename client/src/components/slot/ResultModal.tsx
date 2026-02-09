interface ResultModalProps {
  open: boolean;
  message: string;
  onClose: () => void;
}

export default function ResultModal({ open, message, onClose }: ResultModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="抽獎結果">
      <div className="modal-card">
        <h2>正式模式結果</h2>
        <p>{message}</p>
        <button type="button" onClick={onClose}>
          確定
        </button>
      </div>
    </div>
  );
}
