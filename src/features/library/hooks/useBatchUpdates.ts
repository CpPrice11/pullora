import { useCallback, useEffect, useRef, useState } from 'react'
import { useDownload } from '../../../hooks/useDownload'
import { getReleases } from '../../../services/github'
import { planReleaseInstallation } from '../../../services/download'
import { cleanupIncompleteInstalls, openInstalledAppDir } from '../../../services/installed'
import type { DownloadProgress, GitHubSearchResult } from '../../../types'
import { useI18n } from '../../../i18n'
import { currentStage } from '../../../utils/downloadProgress'

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
    cancel: cancelDownload,
    refresh: refreshBatchDownloads,
  } = useDownload()
  const [batchStarting, setBatchStarting] = useState(false)
  const startingInstalls = useRef(new Set<string>())
  const [installingKeys, setInstallingKeys] = useState<Set<string>>(new Set())
  const [batchUpdateJobs, setBatchUpdateJobs] = useState<Record<string, BatchUpdateJob>>({})
  const [batchUpdateMessage, setBatchUpdateMessage] = useState<string | null>(null)
  const [batchUpdateError, setBatchUpdateError] = useState<string | null>(null)
  const [batchCleanupMessage, setBatchCleanupMessage] = useState<string | null>(null)
  const seenCompletedDownloads = useRef(new Set<string>())
  const batchUpdating = batchStarting || installingKeys.size > 0 || batchDownloads.some((download) =>
    !['completed', 'failed'].includes(currentStage(download)),
  )

  const cancelBatchDownload = useCallback(async (id: string) => {
    await cancelDownload(id)
    setBatchUpdateJobs((current) => {
      const next = { ...current }
      delete next[id]
      return next
    })
  }, [cancelDownload])

  const startBatchUpdateJob = useCallback(async (job: BatchUpdateJob, preferExistingInstall = true) => {
    const id = await startBatchDownload(
      job.url,
      job.fileName,
      job.owner,
      job.repo,
      job.tag,
      job.size,
      preferExistingInstall,
    )
    setBatchUpdateJobs((current) => ({ ...current, [id]: job }))
    return id
  }, [startBatchDownload])

  const startAutomaticInstall = async (repo: GitHubSearchResult, preferExistingInstall = false): Promise<'started' | 'choose' | 'busy'> => {
    const key = repositoryKey(repo)
    if (startingInstalls.current.has(key) || batchDownloads.some((item) =>
      `${item.owner}/${item.repo}`.toLowerCase() === key && !['completed', 'failed'].includes(currentStage(item)),
    )) return 'busy'
    startingInstalls.current.add(key)
    setInstallingKeys(new Set(startingInstalls.current))
    try {
      const releases = await getReleases(repo.owner.login, repo.name)
      const release = releases.find((item) => !item.draft && !item.prerelease)
      if (!release) throw new Error(t('library.installNoRelease'))
      const plan = await planReleaseInstallation(repo.owner.login, repo.name, release.tag_name)
      if (!plan.allowedAssetNames.length && plan.requiredFormat) throw new Error(t('errors.installFormatMismatch'))
      const asset = release.assets.find((item) => item.name === plan.recommendedAssetName)
      if (!asset) return 'choose'
      await startBatchUpdateJob({ url: asset.browser_download_url, fileName: asset.name,
        owner: repo.owner.login, repo: repo.name, tag: release.tag_name, size: asset.size }, preferExistingInstall)
      return 'started'
    } finally {
      startingInstalls.current.delete(key)
      setInstallingKeys(new Set(startingInstalls.current))
    }
  }

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

    setBatchStarting(true)
    const results = await Promise.all(selectedRepositories.map(async (repo) => {
      const key = repositoryKey(repo)
      const latestVersion = getLatestVersion(repo)
      if (!latestVersion) {
        return { key, status: 'skipped' as const }
      }

      try {
        const releases = await getReleases(repo.owner.login, repo.name)
        const release = releases.find((item) => !item.draft && !item.prerelease && item.tag_name === latestVersion)
        if (!release) return { key, status: 'skipped' as const }
        const plan = await planReleaseInstallation(repo.owner.login, repo.name, release.tag_name)
        const asset = release.assets.find((item) => item.name === plan.recommendedAssetName)
        if (!asset || plan.requiredFormat === 'installer') {
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
    setBatchStarting(false)
    const skippedKeys = results.filter((item) => item.status === 'skipped').map((item) => item.key)
    const failedResults = results.filter((item) => item.status === 'failed')
    const failedKeys = failedResults.map((item) => item.key)
    if (startedKeys.length === 0) {
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
    setBatchStarting(true)
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
      setBatchUpdateError(error instanceof Error ? error.message : t('updates.batchFailed'))
    } finally {
      setBatchStarting(false)
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
    const newlyCompleted = batchDownloads.filter((download) =>
      currentStage(download) === 'completed' && !seenCompletedDownloads.current.has(download.id),
    )
    newlyCompleted.forEach((download) => seenCompletedDownloads.current.add(download.id))
    if (newlyCompleted.length > 0) void refreshLocalStatus()
  }, [batchDownloads, refreshLocalStatus])

  return {
    batchDownloads,
    installingKeys,
    startAutomaticInstall,
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
