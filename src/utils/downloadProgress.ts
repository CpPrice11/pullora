import type { DownloadProgress, DownloadStage } from '../types'

export function currentStage(download: DownloadProgress): DownloadStage {
  if (download.status === 'completed' || download.status === 'failed') return download.status
  if (download.stage) return download.stage
  if (download.status === 'pending') return 'queued'
  if (download.status === 'extracting') return 'extracting'
  return 'downloading'
}

export function stageLabel(stage: DownloadStage | undefined, t: (key: string) => string) {
  switch (stage) {
    case 'queued': return t('download.stageQueued')
    case 'downloading': return t('download.stageDownloading')
    case 'verifying': return t('download.stageVerifying')
    case 'extracting': return t('download.stageExtracting')
    case 'installing': return t('download.stageInstalling')
    case 'launchChecking': return t('download.stageLaunchChecking')
    case 'completed': return t('download.stageCompleted')
    case 'failed': return t('download.stageFailed')
    default: return t('download.stageQueued')
  }
}

export function canCancel(download: DownloadProgress) {
  const stage = currentStage(download)
  return stage === 'queued' || stage === 'downloading'
}

export function downloadPercent(download: DownloadProgress) {
  return Number.isFinite(download.progress) ? Math.max(0, Math.min(100, Math.round(download.progress))) : 0
}
