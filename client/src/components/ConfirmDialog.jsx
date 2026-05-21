export default function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', danger = false, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="preview-overlay" onClick={onCancel}>
      <div className="preview-modal" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
        <div className="preview-modal-header">
          <h3>{title}</h3>
          <button className="preview-close" onClick={onCancel}>✕</button>
        </div>
        <div className="preview-modal-body" style={{ padding: '20px 24px' }}>
          <p style={{ margin: '0 0 24px', color: '#374151', lineHeight: 1.6 }}>{message}</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="secondary" onClick={onCancel}>Cancel</button>
            <button
              onClick={onConfirm}
              style={danger ? { background: '#dc2626', borderColor: '#dc2626', color: 'white' } : {}}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
