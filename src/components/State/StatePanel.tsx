import './StatePanel.css'

type StatePanelKind = 'empty' | 'error' | 'loading'

interface StatePanelProps {
  kind: StatePanelKind
  title?: string
  message?: string
  details?: string | null
  detailsLabel?: string
  actionLabel?: string
  onAction?: () => void
  skeletonCount?: number
}

function StatePanel({
  kind,
  title,
  message,
  details,
  detailsLabel = 'Details',
  actionLabel,
  onAction,
  skeletonCount = 3,
}: StatePanelProps) {
  if (kind === 'loading') {
    return (
      <div className="state-panel state-panel--loading" aria-label={title ?? message}>
        {Array.from({ length: skeletonCount }).map((_, index) => (
          <div className="state-skeleton-card" key={index}>
            <span className="state-skeleton-icon" />
            <span className="state-skeleton-line state-skeleton-line--wide" />
            <span className="state-skeleton-line" />
            <span className="state-skeleton-action" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className={`state-panel state-panel--${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <div className="state-panel-mark" aria-hidden="true">
        <span>{kind === 'error' ? '!' : ''}</span>
      </div>
      <div className="state-panel-content">
        {title && <h3>{title}</h3>}
        {message && <p>{message}</p>}
        {details && (
          <details className="state-details">
            <summary>{detailsLabel}</summary>
            <pre>{details}</pre>
          </details>
        )}
      </div>
      {actionLabel && onAction && (
        <button type="button" className="secondary-btn" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  )
}

export default StatePanel
