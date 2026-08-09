import { useCallback, useEffect, useState } from 'react'
import { useDownload } from '../../../hooks/useDownload'
import { getReleases } from '../../../services/github'
import { cleanupIncompleteInstalls, openInstalledAppDir } from '../../../services/installed'
import type { DownloadProgress, GitHubSearchResult } from '../../../types'
import { useI18n } from '../../../i18n'
import { pickPortableReleaseAsset } from '../releaseAssetClassifier'

interface BatchUpdateJob {
  url: string
  fileName: string
  owner: string
  repo: string
  tag: string
  size: number
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
    refresh: refreshBatchDownloads,
  } = useDownload()
  const [batchUpdating, setBatchUpdating] = useState(false)
  const [batchUpdateJobs, setBatchUpdateJobs] = useState<Record<string, BatchUpdateJob>>({})
  const [batchUpdateMessage, setBatchUpdateMessage] = useState<string | null>(null)
  const [batchUpdateError, setBatchUpdateError] = useState<string | null>(null)
  const [batchCleanupMessage, setBatchCleanupMessage] = useState<string | null>(null)

  const startBatchUpdateJob = useCallback(async (job: BatchUpdateJob) => {
    const id = await startBatchDownload(
      job.url,
      job.fileName,
      job.owner,
      job.repo,
      job.tag,
      job.size,
      true,
    )
    setBatchUpdateJobs((current) => ({ ...current, [id]: job }))
    return id
  }, [startBatchDownload])

  const handleUpdateAllPortable = useCallback(async (
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
        const release = releases.find((item) =>
          !item.draft && !item.prerelease && item.tag_name === latestVersion,
        )
          ?? releases.find((item) => !item.draft && !item.prerelease)
          ?? null
        const asset = release ? pickPortableReleaseAsset(release.assets) : null
        if (!release || !asset) {
          return { key, status: 'skipped' as const }
        }

        await startBatchUpdateJob({
          url: asset.browser_download_url,
          fileName: asset.name,
          owner: repo.owner.login,
          repo: repo.name,
          tag: release.tag_name,
          size: asset.size,
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
      if (failedResults.length > 0) {
        setBatchUpdateError(failedResults[0].error)
      } else {
        setBatchUpdateMessage(t('updates.noPortableAssets'))
      }
      return { startedKeys, skippedKeys, failedKeys }
    }

    setBatchUpdateMessage(t('updates.batchStarted', {
      started: startedKeys.length,
      skipped: skippedKeys.length + failedKeys.length,
    }))
    if (failedResults.length > 0) setBatchUpdateError(failedResults[0].error)
    return { startedKeys, skippedKeys, failedKeys }
  }, [getLatestVersion, repositories, startBatchUpdateJob, t])

  const handleBatchRetry = async (download: DownloadProgress) => {
    const job = batchUpdateJobs[download.id] ?? (
      download.sourceUrl && download.owner && download.repo && download.tag
        ? {
            url: download.sourceUrl,
            fileName: download.fileName,
            owner: download.owner,
            repo: download.repo,
            tag: download.tag,
            size: download.totalSize,
          }
        : null
    )
    if (!job) return

    setBatchUpdateError(null)
    setBatchUpdating(true)
    try {
      const id = await startBatchDownload(
        job.url,
        job.fileName,
        job.owner,
        job.repo,
        job.tag,
        job.size,
        true,
      )
      await cancelBatchDownload(download.id)
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
    setBatchUpdateError(null)
    try {
      const count = await cleanupIncompleteInstalls()
      await refreshBatchDownloads()
      setBatchCleanupMessage(t('download.cleanupDone', { count }))
    } catch (error) {
      setBatchCleanupMessage(null)
      setBatchUpdateError(error instanceof Error ? error.message : t('download.cleanupError'))
    }
  }

  useEffect(() => {
    if (!batchUpdateError) return
    const timer = window.setTimeout(() => setBatchUpdateError(null), 6000)
    return () => window.clearTimeout(timer)
  }, [batchUpdateError])

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
