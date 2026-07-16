import { useCallback, useEffect, useState } from 'react'
import { useDownload } from '../../../hooks/useDownload'
import { getReleases } from '../../../services/github'
import { cleanupIncompleteInstalls, openInstalledAppDir } from '../../../services/installed'
import type { DownloadProgress, GitHubAsset, GitHubRelease, GitHubSearchResult } from '../../../types'
import { useI18n } from '../../../i18n'

interface BatchUpdateJob {
  url: string
  fileName: string
  owner: string
  repo: string
  tag: string
}

interface UseBatchUpdatesOptions {
  repositories: GitHubSearchResult[]
  getLatestVersion: (repo: GitHubSearchResult) => string | undefined
  refreshLocalStatus: () => Promise<void>
}

export interface BatchUpdateStartResult {
  startedKeys: string[]
  skippedKeys: string[]
  failedKeys: string[]
}

function repositoryKey(repo: GitHubSearchResult) {
  return `${repo.owner.login}/${repo.name}`.toLowerCase()
}

function assetIsPortableInstall(asset: GitHubAsset) {
  const name = asset.name.toLowerCase()
  if (name.includes('setup') || name.includes('installer') || name.endsWith('.msi')) return false

  return name.includes('portable') ||
    name.endsWith('.exe') ||
    name.endsWith('.appimage') ||
    name.endsWith('.zip') ||
    name.endsWith('.tar.gz') ||
    name.endsWith('.tgz') ||
    name.endsWith('.tar.xz') ||
    name.endsWith('.tar.bz2')
}

function pickPortableUpdateAsset(release: GitHubRelease | null) {
  if (!release) return null
  return [...release.assets]
    .sort((left, right) => {
      const leftPortable = left.name.toLowerCase().includes('portable') ? 0 : 1
      const rightPortable = right.name.toLowerCase().includes('portable') ? 0 : 1
      return leftPortable - rightPortable || left.name.localeCompare(right.name)
    })
    .find(assetIsPortableInstall) ?? null
}

export function useBatchUpdates({
  repositories,
  getLatestVersion,
  refreshLocalStatus,
}: UseBatchUpdatesOptions) {
  const { t } = useI18n()
  const {
    downloads: batchDownloads,
    download: startBatchDownload,
    cancel: cancelBatchDownload,
  } = useDownload()
  const [batchUpdating, setBatchUpdating] = useState(false)
  const [batchUpdateJobs, setBatchUpdateJobs] = useState<Record<string, BatchUpdateJob>>({})
  const [batchUpdateMessage, setBatchUpdateMessage] = useState<string | null>(null)
  const [batchUpdateError, setBatchUpdateError] = useState<string | null>(null)
  const [batchCleanupMessage, setBatchCleanupMessage] = useState<string | null>(null)

  const startBatchUpdateJob = useCallback(async (job: BatchUpdateJob) => {
    const id = await startBatchDownload(job.url, job.fileName, job.owner, job.repo, job.tag)
    setBatchUpdateJobs((current) => ({ ...current, [id]: job }))
    return id
  }, [startBatchDownload])

  const handleUpdateAllPortable = async (
    selectedRepositories: GitHubSearchResult[] = repositories,
  ): Promise<BatchUpdateStartResult> => {
    setBatchUpdateError(null)
    setBatchUpdateMessage(null)
    setBatchCleanupMessage(null)

    if (selectedRepositories.length === 0) {
      setBatchUpdateMessage(t('updates.noneReady'))
      return { startedKeys: [], skippedKeys: [], failedKeys: [] }
    }

    setBatchUpdating(true)
    const results = await Promise.all(selectedRepositories.map(async (repo) => {
      const key = repositoryKey(repo)
      const latestVersion = getLatestVersion(repo)
      if (!latestVersion) {
        return { key, status: 'skipped' as const }
      }

      try {
        const releases = await getReleases(repo.owner.login, repo.name)
        const release = releases.find((item) => item.tag_name === latestVersion)
          ?? releases.find((item) => !item.draft && !item.prerelease)
          ?? null
        const asset = pickPortableUpdateAsset(release)
        if (!release || !asset) {
          return { key, status: 'skipped' as const }
        }

        await startBatchUpdateJob({
          url: asset.browser_download_url,
          fileName: asset.name,
          owner: repo.owner.login,
          repo: repo.name,
          tag: release.tag_name,
        })
        return { key, status: 'started' as const }
      } catch (error) {
        return {
          key,
          status: 'failed' as const,
          error: error instanceof Error ? error.message : t('updates.batchFailed'),
        }
      }
    }))

    const startedKeys = results.filter((item) => item.status === 'started').map((item) => item.key)
    const skippedKeys = results.filter((item) => item.status === 'skipped').map((item) => item.key)
    const failedResults = results.filter((item) => item.status === 'failed')
    const failedKeys = failedResults.map((item) => item.key)
    if (startedKeys.length === 0) {
      setBatchUpdating(false)
      setBatchUpdateError(failedResults[0]?.error ?? t('updates.noPortableAssets'))
      return { startedKeys, skippedKeys, failedKeys }
    }

    setBatchUpdateMessage(t('updates.batchStarted', {
      started: startedKeys.length,
      skipped: skippedKeys.length + failedKeys.length,
    }))
    if (failedResults.length > 0) setBatchUpdateError(failedResults[0].error)
    return { startedKeys, skippedKeys, failedKeys }
  }

  const handleBatchRetry = async (download: DownloadProgress) => {
    const job = batchUpdateJobs[download.id]
    if (!job) return

    setBatchUpdateError(null)
    setBatchUpdating(true)
    try {
      const id = await startBatchDownload(job.url, job.fileName, job.owner, job.repo, job.tag)
      setBatchUpdateJobs((current) => {
        const next = { ...current }
        delete next[download.id]
        next[id] = job
        return next
      })
    } catch (error) {
      setBatchUpdating(false)
      setBatchUpdateError(error instanceof Error ? error.message : t('updates.batchFailed'))
    }
  }

  const handleBatchOpenFolder = (download: DownloadProgress) => {
    if (!download.owner || !download.repo) return
    openInstalledAppDir(download.owner, download.repo)
      .catch((error) => setBatchUpdateError(
        error instanceof Error ? error.message : t('installed.openFolderError'),
      ))
  }

  const handleBatchCleanup = async () => {
    try {
      const count = await cleanupIncompleteInstalls()
      setBatchCleanupMessage(t('download.cleanupDone', { count }))
    } catch (error) {
      setBatchCleanupMessage(error instanceof Error ? error.message : t('download.cleanupError'))
    }
  }

  useEffect(() => {
    if (!batchUpdating) return
    const batchIds = Object.keys(batchUpdateJobs)
    if (batchIds.length === 0) return

    const relevantDownloads = batchDownloads.filter((download) => batchUpdateJobs[download.id])
    const allSettled = relevantDownloads.length === batchIds.length &&
      relevantDownloads.every((download) =>
        download.status === 'completed' || download.status === 'failed',
      )
    if (!allSettled) return

    setBatchUpdating(false)
    void refreshLocalStatus()
  }, [batchDownloads, batchUpdateJobs, batchUpdating, refreshLocalStatus])

  return {
    batchDownloads,
    cancelBatchDownload,
    batchUpdating,
    batchUpdateMessage,
    batchUpdateError,
    batchCleanupMessage,
    handleUpdateAllPortable,
    handleBatchRetry,
    handleBatchOpenFolder,
    handleBatchCleanup,
  }
}
