import type { DownloadProgress as DL, DownloadStage } from '../../types'
import { useI18n } from '../../i18n'
import { formatBytes } from '../../utils/format'
import './Install.css'

interface DownloadProgressProps {
  downloads: DL[]
  onCancel: (id: string) => void
  onLaunch?: (download: DL) => void
  onOpenFolder?: (download: DL) => void
  onBackToLibrary?: () => void
  onRetry?: (download: DL) => void
  onChooseAnother?: () => void
  onCleanup?: () => void
}

const installStages: DownloadStage[] = [
  'queued',
  'downloading',
  'verifying',
  'extracting',
  'runningInstaller',
  'detectingExecutable',
  'registering',
  'completed',
]

function stageLabel(stage: DownloadStage | undefined, t: (key: string) => string) {
  switch (stage) {
    case 'queued': return t('download.stageQueued')
    case 'downloading': return t('download.stageDownloading')
    case 'verifying': return t('download.stageVerifying')
    case 'extracting': return t('download.stageExtracting')
    case 'runningInstaller': return t('download.stageRunningInstaller')
    case 'detectingExecutable': return t('download.stageDetectingExecutable')
    case 'registering': return t('download.stageRegistering')
    case 'completed': return t('download.stageCompleted')
    case 'failed': return t('download.stageFailed')
    default: return t('download.stageQueued')
  }
}

function stageDescription(stage: DownloadStage | undefined, t: (key: string) => string) {
  switch (stage) {
    case 'queued': return t('download.stageQueuedText')
    case 'downloading': return t('download.stageDownloadingText')
    case 'verifying': return t('download.stageVerifyingText')
    case 'extracting': return t('download.stageExtractingText')
    case 'runningInstaller': return t('download.stageRunningInstallerText')
    case 'detectingExecutable': return t('download.stageDetectingExecutableText')
    case 'registering': return t('download.stageRegisteringText')
    case 'completed': return t('download.stageCompletedText')
    case 'failed': return t('download.stageFailedText')
    default: return t('download.stageQueuedText')
  }
}

function currentStage(download: DL): DownloadStage {
  if (download.stage) return download.stage
  if (download.status === 'pending') return 'queued'
  if (download.status === 'extracting') return 'extracting'
  if (download.status === 'completed') return 'completed'
  if (download.status === 'failed') return 'failed'
  return 'downloading'
}

function canCancel(download: DL) {
  const stage = currentStage(download)
  return download.status === 'pending' || stage === 'queued' || stage === 'downloading'
}

function DownloadProgressPanel({
  downloads,
  onCancel,
  onLaunch,
  onOpenFolder,
  onBackToLibrary,
  onRetry,
  onChooseAnother,
  onCleanup,
}: DownloadProgressProps) {
  const { t } = useI18n()

  if (downloads.length === 0) return null

  return (
    <div className="download-panel">
      <div className="download-panel-head">
        <h3 className="download-panel-title">{t('download.title')}</h3>
        <span className="download-panel-count">{downloads.length}</span>
      </div>
      <div className="download-list">
        {downloads.map((download) => {
          const stage = currentStage(download)
          const stageIndex = installStages.indexOf(stage)
          const failed = download.status === 'failed' || stage === 'failed'
          const completed = download.status === 'completed' || stage === 'completed'

          return (
            <div
              key={download.id}
              className={`download-item download-item--${download.status}`}
            >
              <div className="download-stage-mark" aria-hidden="true">
                <span>{completed ? 'OK' : Math.round(download.progress)}</span>
              </div>
              <div className="download-header">
                <div className="download-title-block">
                  <span className="download-status">{stageLabel(stage, t)}</span>
                  <span className="download-name" title={download.fileName}>
                    {download.fileName}
                  </span>
                </div>
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

              <p className="download-stage-note">{stageDescription(stage, t)}</p>

              <div className="progress-bar-wrap">
                <div
                  className="progress-bar-fill"
                  style={{ width: `${Math.max(0, Math.min(100, download.progress))}%` }}
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
                {download.totalSize > 0 && (
                  <span>
                    {formatBytes(download.downloadedSize)} / {formatBytes(download.totalSize)}
                  </span>
                )}
                {download.installPath && <span>{download.installPath}</span>}
                <span className="download-pct">{Math.round(download.progress)}%</span>
              </div>

              {completed && (
                <div className="download-actions">
                  {onLaunch && (
                    <button type="button" className="download-action-btn primary" onClick={() => onLaunch(download)}>
                      {t('download.launch')}
                    </button>
                  )}
                  {onOpenFolder && (
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
                <div className="download-recovery">
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
                      <pre>{download.error}</pre>
                    </details>
                  )}
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
                    {onOpenFolder && (
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
