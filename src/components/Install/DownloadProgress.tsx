import { useState, type CSSProperties } from 'react'
import type { DownloadProgress as DL, DownloadStage } from '../../types'
import { useI18n } from '../../i18n'
import { getLocalizedErrorMessage } from '../../services/tauri'
import { formatBytes } from '../../utils/format'
import { canCancel, currentStage, downloadPercent, stageLabel } from '../../utils/downloadProgress'
import DownloadPauseButton from './DownloadPauseButton'
import './Install.css'

interface DownloadProgressProps {
  downloads: DL[]
  onSetPaused?: (id: string, paused: boolean) => Promise<void>
  onCancel: (id: string) => void
  onLaunch?: (download: DL) => void
  onOpenFolder?: (download: DL) => void
  onBackToLibrary?: () => void
  onRetry?: (download: DL) => void
  onChooseAnother?: () => void
  onCleanup?: () => void
  compact?: boolean
}

const installStages: DownloadStage[] = [
  'queued',
  'downloading',
  'verifying',
  'extracting',
  'installing',
  'launchChecking',
  'completed',
]

function stageDescription(stage: DownloadStage | undefined, t: (key: string) => string) {
  switch (stage) {
    case 'queued': return t('download.stageQueuedText')
    case 'downloading': return t('download.stageDownloadingText')
    case 'verifying': return t('download.stageVerifyingText')
    case 'extracting': return t('download.stageExtractingText')
    case 'installing': return t('download.stageInstallingText')
    case 'launchChecking': return t('download.stageLaunchCheckingText')
    case 'completed': return t('download.stageCompletedText')
    case 'failed': return t('download.stageFailedText')
    default: return t('download.stageQueuedText')
  }
}

function DownloadProgressPanel({
  downloads,
  onCancel,
  onSetPaused,
  onLaunch,
  onOpenFolder,
  onBackToLibrary,
  onRetry,
  onChooseAnother,
  onCleanup,
  compact = false,
}: DownloadProgressProps) {
  const { language, t } = useI18n()
  const [controlError, setControlError] = useState<string | null>(null)
  const [showCompleted, setShowCompleted] = useState(false)

  if (downloads.length === 0) return null
  const busy = downloads.some((download) => !['completed', 'failed'].includes(currentStage(download)))
  const completedCount = downloads.filter((download) => currentStage(download) === 'completed').length
  const visibleDownloads = compact && !showCompleted
    ? downloads.filter((download) => currentStage(download) !== 'completed')
    : downloads

  return (
    <div className={`download-panel ${compact ? 'download-panel--compact' : ''}`} aria-busy={busy}>
      {controlError && <p role="alert">{controlError}</p>}
      <div className="download-panel-head">
        <h3 className="download-panel-title">{t('download.title')}</h3>
        <div className="download-panel-head-actions">
          {compact && completedCount > 0 && (
            <button
              type="button"
              className="secondary-btn download-completed-toggle"
              aria-expanded={showCompleted}
              onClick={() => setShowCompleted((visible) => !visible)}
            >
              {t(showCompleted ? 'download.hideCompleted' : 'download.showCompleted', { count: completedCount })}
            </button>
          )}
          <span className="download-panel-count">{downloads.length}</span>
        </div>
      </div>
      <div className="download-list">
        {visibleDownloads.map((download) => {
          const stage = currentStage(download)
          const stageIndex = installStages.indexOf(stage)
          const failed = download.status === 'failed' || stage === 'failed'
          const completed = download.status === 'completed' || stage === 'completed'
          const hasInstalledTarget = Boolean(download.owner && download.repo)
          const progress = downloadPercent(download)

          return (
            <div
              key={download.id}
              className={`download-item download-item--${download.status}`}
            >
              <div className="download-stage-mark" aria-hidden="true">
                <span>{completed ? 'OK' : progress}</span>
              </div>
              <div className="download-header">
                <div className="download-title-block">
                  <span
                    className="download-status"
                    role="status"
                    aria-live="polite"
                    aria-atomic="true"
                  >
                    {download.paused ? t('download.paused') : stageLabel(stage, t)}
                  </span>
                  <span className="download-name" title={download.fileName}>
                    {download.fileName}
                  </span>
                </div>
                {onSetPaused && <DownloadPauseButton download={download} onChange={onSetPaused} onError={(error) => setControlError(String(error))} />}
                {canCancel(download) && (
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

              <p className="download-stage-note">{download.paused ? t('download.pausedText') : stageDescription(stage, t)}</p>

              <div
                className="progress-bar-wrap"
                role="progressbar"
                aria-label={`${download.fileName}: ${download.paused ? t('download.paused') : stageLabel(stage, t)}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
              >
                <div
                  className="progress-bar-fill"
                  style={{ '--download-progress': String(progress / 100) } as CSSProperties}
                />
              </div>

              <div className="download-timeline" aria-label={t('download.timeline')}>
                {installStages.map((item, index) => {
                  const done = completed || (stageIndex >= 0 && index < stageIndex)
                  const current = item === stage && !failed && !completed
                  const itemFailed = failed && index === Math.max(stageIndex, 0)

                  return (
                    <span
                      key={item}
                      className={`download-step ${done ? 'done' : ''} ${current ? 'current' : ''} ${itemFailed ? 'failed' : ''}`}
                      title={stageLabel(item, t)}
                    >
                      {stageLabel(item, t)}
                    </span>
                  )
                })}
              </div>

              <div className="download-meta">
                {download.checksumStatus && <span>{t(`download.checksum.${download.checksumStatus}`)}</span>}
                {download.totalSize > 0 && (
                  <span>
                    {formatBytes(download.downloadedSize, language)} / {formatBytes(download.totalSize, language)}
                  </span>
                )}
                {download.installPath && <span>{download.installPath}</span>}
                <span className="download-pct">{progress}%</span>
              </div>

              {completed && (onBackToLibrary || (hasInstalledTarget && (onLaunch || onOpenFolder))) && (
                <div className="download-actions">
                  {onLaunch && hasInstalledTarget && (
                    <button type="button" className="download-action-btn primary" onClick={() => onLaunch(download)}>
                      {t('download.launch')}
                    </button>
                  )}
                  {onOpenFolder && hasInstalledTarget && (
                    <button type="button" className="download-action-btn" onClick={() => onOpenFolder(download)}>
                      {t('download.openFolder')}
                    </button>
                  )}
                  {onBackToLibrary && (
                    <button type="button" className="download-action-btn" onClick={onBackToLibrary}>
                      {t('download.backToLibrary')}
                    </button>
                  )}
                </div>
              )}

              {failed && (
                <div className="download-recovery" role="alert">
                  <strong>{t('download.recoveryTitle')}</strong>
                  <p>{t('download.recoveryText')}</p>
                  <ul className="download-recovery-steps">
                    <li>{t('download.recoveryStepRetry')}</li>
                    <li>{t('download.recoveryStepAsset')}</li>
                    <li>{t('download.recoveryStepCleanup')}</li>
                  </ul>
                  {download.error && (
                    <details className="download-error-details">
                      <summary>{t('download.details')}</summary>
                      <pre>{getLocalizedErrorMessage(download.error)}</pre>
                    </details>
                  )}
                  {(onRetry || onChooseAnother || onCleanup || (onOpenFolder && hasInstalledTarget)) && (
                    <div className="download-actions">
                      {onRetry && (
                        <button type="button" className="download-action-btn primary" onClick={() => onRetry(download)}>
                          {t('download.retry')}
                        </button>
                      )}
                      {onChooseAnother && (
                        <button type="button" className="download-action-btn" onClick={onChooseAnother}>
                          {t('download.chooseAnother')}
                        </button>
                      )}
                      {onOpenFolder && hasInstalledTarget && (
                        <button type="button" className="download-action-btn" onClick={() => onOpenFolder(download)}>
                          {t('download.openFolder')}
                        </button>
                      )}
                      {onCleanup && (
                        <button type="button" className="download-action-btn" onClick={onCleanup}>
                          {t('download.cleanup')}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default DownloadProgressPanel
