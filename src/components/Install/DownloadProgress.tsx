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
        {downloads.map((download) => (
          <div
            key={download.id}
            className={`download-item download-item--${download.status}`}
          >
            <div className="download-header">
              <span className="download-name" title={download.fileName}>
                {download.fileName}
              </span>
              <span className="download-status">{statusLabel(download.status)}</span>
              {(download.status === 'downloading' || download.status === 'pending') && (
                <button
                  className="cancel-btn"
                  onClick={() => onCancel(download.id)}
                  title="Cancel download"
                >
                  Cancel
                </button>
              )}
            </div>

            <div className="progress-bar-wrap">
              <div
                className="progress-bar-fill"
                style={{ width: `${download.progress}%` }}
              />
            </div>

            <div className="download-meta">
              {download.status === 'downloading' && download.totalSize > 0 && (
                <span>
                  {formatBytes(download.downloadedSize)} / {formatBytes(download.totalSize)}
                </span>
              )}
              {download.status === 'completed' && (
                <span className="done-text">Installed successfully</span>
              )}
              {download.status === 'failed' && (
                <span className="error-text">{download.error ?? 'Unknown error'}</span>
              )}
              <span className="download-pct">{Math.round(download.progress)}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default DownloadProgressPanel
