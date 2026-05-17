import type { DownloadProgress as DL } from '../../types'
import { useI18n } from '../../i18n'
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

function statusLabel(status: DL['status'], t: (key: string) => string) {
  switch (status) {
    case 'pending':     return t('download.pending')
    case 'downloading': return t('download.downloading')
    case 'extracting':  return t('download.extracting')
    case 'completed':   return t('download.completed')
    case 'failed':      return t('download.failed')
  }
}

function DownloadProgressPanel({ downloads, onCancel }: DownloadProgressProps) {
  const { t } = useI18n()

  if (downloads.length === 0) return null

  return (
    <div className="download-panel">
      <h3 className="download-panel-title">{t('download.title')}</h3>
      <div className="download-list">
        {downloads.map((download) => (
          <div
            key={download.id}
            className={`download-item download-item--${download.status}`}
          >
            <div className="download-stage-mark" aria-hidden="true">
              <span>{Math.round(download.progress)}</span>
            </div>
            <div className="download-header">
              <div className="download-title-block">
                <span className="download-status">{statusLabel(download.status, t)}</span>
                <span className="download-name" title={download.fileName}>
                  {download.fileName}
                </span>
              </div>
              {(download.status === 'downloading' || download.status === 'pending') && (
                <button
                  type="button"
                  className="cancel-btn"
                  onClick={() => onCancel(download.id)}
                  title={t('download.cancelTitle')}
                  aria-label={t('download.cancelTitle')}
                >
                  {t('download.cancel')}
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
                <span className="done-text">{t('download.done')}</span>
              )}
              {download.status === 'failed' && (
                <span className="error-text">{download.error ?? t('download.unknownError')}</span>
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
