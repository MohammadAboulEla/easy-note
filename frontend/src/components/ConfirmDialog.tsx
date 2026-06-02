import { useEffect } from 'react';

interface Props {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
}

// Minimal confirmation modal. Reuses the shared scrim/dialog markup so it
// matches AboutDialog/SettingsDialog. Esc cancels, Enter confirms.
export function ConfirmDialog({ title, message, confirmLabel = 'Delete', onConfirm, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'Enter') onConfirm();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, onConfirm]);

  return (
    <div className="modal-scrim" onMouseDown={onClose}>
      <div className="dlg confirm-dlg" role="dialog" aria-modal="true" aria-label={title}
        onMouseDown={e => e.stopPropagation()}>
        <div className="dlg-head">
          <h3>{title}</h3>
          <button className="x" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <div className="confirm-body">
          <p>{message}</p>
        </div>
        <div className="dlg-foot">
          <button className="ghost" onClick={onClose}>Cancel</button>
          <button className="danger" autoFocus onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
