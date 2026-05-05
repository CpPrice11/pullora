import type { DownloadProgress as DL } from '../../types'
import './Install.css'

interface DownloadProgressProps {
  downloads: DL[]
  onCancel: (id: string) => void
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function statusLabel(status: DL['status']) {
  switch (status) {
    case 'pending':     return 'Waiting...'
    case 'downloading': return 'Downloading'
    case 'extracting':  return 'Extracting'
    case 'completed':   return 'Done'
    case 'failed':      return 'Failed'
  }
}

function DownloadProgressPanel({ downloads, onCancel }: DownloadProgressProps) {
  if (downloads.length === 0) return null

  return (
    <div className="download-panel">
      <h3 className="download-panel-title">Downloads</h3>
      <div className="download-list">
        {downloads.map((dl) => (
          <div
            key={dl.id}
            className={`download-item download-item--${dl.status}`}
          >
            <div className="download-header">
              <span className="download-name" title={dl.fileName}>
                {dl.fileName}
              </span>
              <span className="download-status">{statusLabel(dl.status)}</span>
              {(dl.status === 'downloading' || dl.status === 'pending') && (
                <button
                  className="cancel-btn"
                  onClick={() => onCancel(dl.id)}
                  title="Cancel download"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="progress-bar-wrap">
              <div
                className="progress-bar-fill"
                style={{ width: `${dl.progress}%` }}
              />
            </div>

            <div className="download-meta">
              {dl.status === 'downloading' && dl.totalSize > 0 && (
                <span>
                  {formatBytes(dl.downloadedSize)} / {formatBytes(dl.totalSize)}
                </span>
              )}
              {dl.status === 'completed' && (
                <span className="done-text">✓ Installed successfully</span>
              )}
              {dl.status === 'failed' && (
                <span className="error-text">✕ {dl.error ?? 'Unknown error'}</span>
              )}
              <span className="download-pct">{Math.round(dl.progress)}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default DownloadProgressPanel
