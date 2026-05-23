import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useOwnerRepositories } from '../hooks/useGitHub'
import { useSettings } from '../hooks/useSettings'
import { useLibraryStatus } from '../hooks/useLibraryStatus'
import { useDownload } from '../hooks/useDownload'
import RepoCard from '../components/Search/RepoCard'
import ReleaseSelector from '../components/Search/ReleaseSelector'
import AppDetailsModal from '../components/Search/AppDetailsModal'
import DownloadProgressPanel from '../components/Install/DownloadProgress'
import StatePanel from '../components/State/StatePanel'
import { cleanupIncompleteInstalls, launchApp, openInstalledAppDir } from '../services/installed'
import { getReleases } from '../services/github'
import { addToFavorites, getFavorites, removeFromFavorites } from '../services/favorites'
import { pickImageFile } from '../services/dialog'
import {
  clearProjectArt,
  listProjectArt,
  projectArtCoverUrl,
  projectArtKey,
  setProjectArt,
} from '../services/projectArt'
import type { DownloadProgress, GitHubAsset, GitHubRelease, GitHubSearchResult, ProjectArt } from '../types'
import { useI18n } from '../i18n'
import './PageStyles.css'

type LibraryFilter = 'all' | 'installed' | 'favorites' | 'updates' | 'available'
type LibrarySort = 'updated' | 'name' | 'status'
type LibraryErrorKind = 'rateLimit' | 'offline' | 'notFound' | 'generic'
type LibraryTrustKind = 'fresh' | 'checking' | 'cached' | 'rateLimit' | 'offline' | 'partial'
type BatchUpdateJob = {
  url: string
  fileName: string
  owner: string
  repo: string
  tag: string
}

const libraryFilters: LibraryFilter[] = ['all', 'installed', 'favorites', 'updates', 'available']

function libraryFilterLabelKey(filter: LibraryFilter) {
  return filter === 'available' ? 'library.availableFilter' : `library.${filter}`
}

interface SearchPageProps {
  hasLauncherBackground?: boolean
  onChangeLauncherBackground?: () => Promise<void> | void
  onClearLauncherBackground?: () => Promise<void> | void
}

function classifyLibraryError(error: string | null): LibraryErrorKind {
  const normalized = error?.toLowerCase() ?? ''
  if (normalized.includes('rate limit') || normalized.includes('403')) return 'rateLimit'
  if (normalized.includes('not found') || normalized.includes('404')) return 'notFound'
  if (
    normalized.includes('network') ||
    normalized.includes('dns') ||
    normalized.includes('timed out') ||
    normalized.includes('timeout') ||
    normalized.includes('connection') ||
    normalized.includes('offline')
  ) {
    return 'offline'
  }
  return 'generic'
}

function libraryErrorTitleKey(kind: LibraryErrorKind) {
  switch (kind) {
    case 'rateLimit': return 'library.errorRateLimitTitle'
    case 'offline': return 'library.errorOfflineTitle'
    case 'notFound': return 'library.errorOwnerTitle'
    case 'generic': return 'state.githubErrorTitle'
  }
}

function libraryErrorTextKey(kind: LibraryErrorKind) {
  switch (kind) {
    case 'rateLimit': return 'library.errorRateLimitText'
    case 'offline': return 'library.errorOfflineText'
    case 'notFound': return 'library.errorOwnerText'
    case 'generic': return 'state.githubErrorText'
  }
}

function updateDismissKey(repo: GitHubSearchResult, latestVersion: string) {
  return `${repo.owner.login}/${repo.name}@${latestVersion}`.toLowerCase()
}

function assetIsPortableInstall(asset: GitHubAsset) {
  const name = asset.name.toLowerCase()
  const isInstaller = name.includes('setup') ||
    name.includes('installer') ||
    name.endsWith('.msi')
  if (isInstaller) return false

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

function SearchPage({
  hasLauncherBackground = false,
  onChangeLauncherBackground,
  onClearLauncherBackground,
}: SearchPageProps) {
  const { language, t } = useI18n()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<LibraryFilter>('all')
  const [sort, setSort] = useState<LibrarySort>('updated')
  const [selectedRepo, setSelectedRepo] = useState<GitHubSearchResult | null>(null)
  const [detailsRepo, setDetailsRepo] = useState<GitHubSearchResult | null>(null)
  const [featuredRepo, setFeaturedRepo] = useState<GitHubSearchResult | null>(null)
  const [recentlyInstalledKey, setRecentlyInstalledKey] = useState<string | null>(null)
  const [projectArt, setProjectArtState] = useState<Record<string, ProjectArt>>({})
  const [favoriteKeys, setFavoriteKeys] = useState<Set<string>>(new Set())
  const [favoriteBusy, setFavoriteBusy] = useState(false)
  const [heroActionsOpen, setHeroActionsOpen] = useState(false)
  const [artError, setArtError] = useState<string | null>(null)
  const [launchError, setLaunchError] = useState<string | null>(null)
  const [refreshState, setRefreshState] = useState<'idle' | 'success' | 'error'>('idle')
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null)
  const [dismissedUpdateKeys, setDismissedUpdateKeys] = useState<Set<string>>(new Set())
  const [batchUpdating, setBatchUpdating] = useState(false)
  const [batchUpdateJobs, setBatchUpdateJobs] = useState<Record<string, BatchUpdateJob>>({})
  const [batchUpdateMessage, setBatchUpdateMessage] = useState<string | null>(null)
  const [batchUpdateError, setBatchUpdateError] = useState<string | null>(null)
  const [batchCleanupMessage, setBatchCleanupMessage] = useState<string | null>(null)
  const { settings, loading: settingsLoading } = useSettings()
  const {
    downloads: batchDownloads,
    download: startBatchDownload,
    cancel: cancelBatchDownload,
  } = useDownload()
  const heroActionsRef = useRef<HTMLDivElement | null>(null)
  const owner = settings.githubOwner?.trim()
  const { state, loadRepositories, refreshRepositories, loadMore } = useOwnerRepositories(owner)
  const {
    checkingUpdates,
    latestVersionErrorCount,
    latestVersionsCheckedAt,
    installedLoadError,
    getInstalledApp,
    getLatestVersion,
    refreshInstalledApps,
    refreshLatestVersions,
  } = useLibraryStatus(state.repositories)

  const handleRefresh = async () => {
    setRefreshState('idle')
    const freshRepositories = await refreshRepositories()
    const freshInstalledApps = await refreshInstalledApps()

    if (!freshRepositories) {
      setRefreshState('error')
      return
    }

    await refreshLatestVersions(freshInstalledApps, freshRepositories)
    setLastRefreshedAt(new Date())
    setRefreshState('success')
  }

  const handleInstalledFromRelease = async () => {
    if (selectedRepo) {
      const key = projectArtKey(selectedRepo.owner.login, selectedRepo.name)
      setRecentlyInstalledKey(key)
      setFeaturedRepo(selectedRepo)
      window.setTimeout(() => {
        setRecentlyInstalledKey((current) => current === key ? null : current)
      }, 6500)
    }
    const freshInstalledApps = await refreshInstalledApps()
    await refreshLatestVersions(freshInstalledApps, state.repositories)
  }

  const refreshLocalStatus = useCallback(async () => {
    const freshInstalledApps = await refreshInstalledApps()
    await refreshLatestVersions(freshInstalledApps, state.repositories)
  }, [refreshInstalledApps, refreshLatestVersions, state.repositories])

  const handleSkipUpdate = (repo: GitHubSearchResult) => {
    const latestVersion = getLatestVersion(repo)
    if (!latestVersion) return
    setDismissedUpdateKeys((current) => {
      const next = new Set(current)
      next.add(updateDismissKey(repo, latestVersion))
      return next
    })
  }

  const handleClearSkippedUpdates = () => {
    setDismissedUpdateKeys(new Set())
  }

  const startBatchUpdateJob = useCallback(async (job: BatchUpdateJob) => {
    const id = await startBatchDownload(job.url, job.fileName, job.owner, job.repo, job.tag)
    setBatchUpdateJobs((current) => ({ ...current, [id]: job }))
    return id
  }, [startBatchDownload])

  const handleUpdateAllPortable = async () => {
    setBatchUpdateError(null)
    setBatchUpdateMessage(null)
    setBatchCleanupMessage(null)

    if (updateRepositories.length === 0) {
      setBatchUpdateMessage(t('updates.noneReady'))
      return
    }

    setBatchUpdating(true)
    let started = 0
    let skipped = 0

    const results = await Promise.all(updateRepositories.map(async (repo) => {
      const latestVersion = getLatestVersion(repo)
      if (!latestVersion) {
        skipped += 1
        return
      }

      try {
        const releases = await getReleases(repo.owner.login, repo.name)
        const release = releases.find((item) => item.tag_name === latestVersion)
          ?? releases.find((item) => !item.draft && !item.prerelease)
          ?? null
        const asset = pickPortableUpdateAsset(release)
        if (!release || !asset) {
          skipped += 1
          return
        }

        await startBatchUpdateJob({
          url: asset.browser_download_url,
          fileName: asset.name,
          owner: repo.owner.login,
          repo: repo.name,
          tag: release.tag_name,
        })
        started += 1
      } catch (err) {
        skipped += 1
        return err instanceof Error ? err.message : t('updates.batchFailed')
      }
    }))

    const errors = results.filter((item): item is string => typeof item === 'string')
    if (started === 0) {
      setBatchUpdating(false)
      setBatchUpdateError(errors[0] ?? t('updates.noPortableAssets'))
      return
    }

    setBatchUpdateMessage(t('updates.batchStarted', { started, skipped }))
    if (errors.length > 0) {
      setBatchUpdateError(errors[0])
    }
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
    } catch (err) {
      setBatchUpdating(false)
      setBatchUpdateError(err instanceof Error ? err.message : t('updates.batchFailed'))
    }
  }

  const handleBatchOpenFolder = (download: DownloadProgress) => {
    if (!download.owner || !download.repo) return
    openInstalledAppDir(download.owner, download.repo)
      .catch((err) => setBatchUpdateError(
        err instanceof Error ? err.message : t('installed.openFolderError'),
      ))
  }

  const handleBatchCleanup = async () => {
    try {
      const count = await cleanupIncompleteInstalls()
      setBatchCleanupMessage(t('download.cleanupDone', { count }))
    } catch (err) {
      setBatchCleanupMessage(err instanceof Error ? err.message : t('download.cleanupError'))
    }
  }

  const formatTime = (date: Date | null) => date
    ? date.toLocaleTimeString(language === 'en' ? 'en-US' : 'uk-UA', {
      hour: '2-digit',
      minute: '2-digit',
    })
    : null
  const formattedRefreshTime = formatTime(lastRefreshedAt ?? state.lastRefreshAt ?? state.lastLoadedAt)
  const formattedLatestVersionsTime = formatTime(latestVersionsCheckedAt)
  const libraryErrorKind = classifyLibraryError(state.error)
  const libraryTrustKind: LibraryTrustKind = state.error && state.isStale
    ? libraryErrorKind === 'rateLimit'
      ? 'rateLimit'
      : libraryErrorKind === 'offline'
        ? 'offline'
        : 'cached'
    : state.loading || checkingUpdates
      ? 'checking'
      : latestVersionErrorCount > 0
        ? 'partial'
        : 'fresh'

  useEffect(() => {
    if (!settingsLoading) {
      loadRepositories(1)
    }
  }, [settingsLoading, loadRepositories])

  useEffect(() => {
    listProjectArt()
      .then((items) => {
        setProjectArtState(Object.fromEntries(
          items.map((item) => [projectArtKey(item.owner, item.repo), item]),
        ))
      })
      .catch(() => {})
  }, [])

  const loadFavorites = async () => {
    const favorites = await getFavorites()
    setFavoriteKeys(new Set(favorites.map((item) => projectArtKey(item.owner, item.repo))))
  }

  useEffect(() => {
    loadFavorites().catch(() => {})
  }, [])

  useEffect(() => {
    if (!heroActionsOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!heroActionsRef.current?.contains(event.target as Node)) {
        setHeroActionsOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setHeroActionsOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [heroActionsOpen])

  useEffect(() => {
    if (!batchUpdating) return
    const batchIds = Object.keys(batchUpdateJobs)
    if (batchIds.length === 0) return

    const relevantDownloads = batchDownloads.filter((download) => batchUpdateJobs[download.id])
    const allStarted = relevantDownloads.length === batchIds.length
    const allSettled = allStarted && relevantDownloads.every((download) =>
      download.status === 'completed' || download.status === 'failed',
    )

    if (!allSettled) return

    setBatchUpdating(false)
    void refreshLocalStatus()
  }, [batchDownloads, batchUpdateJobs, batchUpdating, refreshLocalStatus])

  const updateRepositories = useMemo(() => {
    return state.repositories.filter((repo) => {
      const installedApp = getInstalledApp(repo)
      const latestVersion = getLatestVersion(repo)
      if (!installedApp || !latestVersion || latestVersion === installedApp.activeVersion) return false
      return !dismissedUpdateKeys.has(updateDismissKey(repo, latestVersion))
    })
  }, [dismissedUpdateKeys, getInstalledApp, getLatestVersion, state.repositories])

  const visibleRepositories = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    const filtered = state.repositories.filter((repo) => {
      const installedApp = getInstalledApp(repo)
      const latestVersion = getLatestVersion(repo)
      const isFavorite = favoriteKeys.has(projectArtKey(repo.owner.login, repo.name))
      const hasUpdate = Boolean(
        installedApp &&
        latestVersion &&
        latestVersion !== installedApp.activeVersion,
      )
      const updateDismissed = Boolean(
        latestVersion && dismissedUpdateKeys.has(updateDismissKey(repo, latestVersion)),
      )

      if (filter === 'installed' && !installedApp) return false
      if (filter === 'favorites' && !isFavorite) return false
      if (filter === 'updates' && (!hasUpdate || updateDismissed)) return false
      if (filter === 'available' && installedApp) return false

      if (!normalizedQuery) return true

      const searchableText = [
        repo.name,
        repo.full_name,
        repo.description ?? '',
        repo.language ?? '',
        ...(repo.topics ?? []),
      ]
        .join(' ')
        .toLowerCase()

      return searchableText.includes(normalizedQuery)
    })

    return [...filtered].sort((a, b) => {
      if (sort === 'name') {
        return a.name.localeCompare(b.name)
      }

      if (sort === 'status') {
        const statusRank = (repo: GitHubSearchResult) => {
          const installedApp = getInstalledApp(repo)
          const latestVersion = getLatestVersion(repo)
          if (
            installedApp &&
            latestVersion &&
            latestVersion !== installedApp.activeVersion
          ) {
            return 0
          }
          if (installedApp) return 1
          return 2
        }

        return statusRank(a) - statusRank(b) || a.name.localeCompare(b.name)
      }

      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    })
  }, [dismissedUpdateKeys, favoriteKeys, filter, getInstalledApp, getLatestVersion, query, sort, state.repositories])

  useEffect(() => {
    if (visibleRepositories.length === 0) {
      setFeaturedRepo(null)
      return
    }

    if (
      !featuredRepo ||
      !visibleRepositories.some((repo) => repo.id === featuredRepo.id)
    ) {
      setFeaturedRepo(visibleRepositories[0])
    }
  }, [featuredRepo, visibleRepositories])

  useEffect(() => {
    setHeroActionsOpen(false)
  }, [featuredRepo?.id])

  const featuredArt = featuredRepo
    ? projectArt[projectArtKey(featuredRepo.owner.login, featuredRepo.name)]
    : undefined
  const featuredCover = projectArtCoverUrl(featuredArt)

  const handleLaunch = async (repo: GitHubSearchResult) => {
    setLaunchError(null)
    try {
      await launchApp(repo.owner.login, repo.name)
    } catch (err) {
      setLaunchError(err instanceof Error ? err.message : t('library.launchError'))
    }
  }

  const handlePickArt = async (kind: 'cover', targetRepo = featuredRepo) => {
    if (!targetRepo) return

    setHeroActionsOpen(false)
    setArtError(null)
    const imagePath = await pickImageFile()
    if (!imagePath) return

    try {
      const updatedArt = await setProjectArt(
        targetRepo.owner.login,
        targetRepo.name,
        kind,
        imagePath,
      )
      setProjectArtState((current) => ({
        ...current,
        [projectArtKey(targetRepo.owner.login, targetRepo.name)]: updatedArt,
      }))
    } catch {
      setArtError(t('art.saveError'))
    }
  }

  const handleClearArt = async (targetRepo = featuredRepo) => {
    if (!targetRepo) return

    setHeroActionsOpen(false)
    setArtError(null)
    try {
      const updatedArt = await clearProjectArt(
        targetRepo.owner.login,
        targetRepo.name,
        'cover',
      )
      setProjectArtState((current) => ({
        ...current,
        [projectArtKey(targetRepo.owner.login, targetRepo.name)]: updatedArt,
      }))
    } catch {
      setArtError(t('art.clearError'))
    }
  }

  const handleFavoriteChange = (repo: GitHubSearchResult, nextValue: boolean) => {
    const key = projectArtKey(repo.owner.login, repo.name)
    setFavoriteKeys((current) => {
      const next = new Set(current)
      if (nextValue) {
        next.add(key)
      } else {
        next.delete(key)
      }
      return next
    })
  }

  const handleToggleFeaturedFavorite = async () => {
    if (!featuredRepo) return

    const key = projectArtKey(featuredRepo.owner.login, featuredRepo.name)
    const isFavorite = favoriteKeys.has(key)
    setFavoriteBusy(true)

    try {
      if (isFavorite) {
        await removeFromFavorites(featuredRepo.owner.login, featuredRepo.name)
        handleFavoriteChange(featuredRepo, false)
      } else {
        await addToFavorites(
          featuredRepo.owner.login,
          featuredRepo.name,
          featuredRepo.name,
          featuredRepo.description ?? undefined,
        )
        handleFavoriteChange(featuredRepo, true)
      }
    } catch {
      setArtError(t('art.saveError'))
    } finally {
      setFavoriteBusy(false)
    }
  }

  const renderUpdatesCenter = () => {
    if (filter !== 'updates') return null

    const skippedCount = dismissedUpdateKeys.size
    const updatesEmptyKey = checkingUpdates
      ? 'updates.emptyChecking'
      : latestVersionErrorCount > 0
        ? 'updates.emptyPartial'
        : latestVersionsCheckedAt
          ? 'updates.emptyCurrent'
          : 'updates.emptyNotChecked'
    const failedDownload = batchDownloads.find((download) => download.status === 'failed')
    const chooseAnotherRepo = failedDownload
      ? state.repositories.find((repo) =>
        repo.owner.login === failedDownload.owner && repo.name === failedDownload.repo,
      )
      : updateRepositories[0]

    return (
      <section className="updates-center" aria-label={t('updates.centerTitle')}>
        <div className="updates-center-main">
          <div>
            <span className="updates-center-kicker">{t('updates.kicker')}</span>
            <h3>{t('updates.centerTitle')}</h3>
            <p>{t('updates.centerText')}</p>
          </div>
          <div className="updates-center-actions">
            <button
              type="button"
              className="secondary-btn"
              onClick={() => refreshLocalStatus()}
              disabled={checkingUpdates || batchUpdating}
            >
              {checkingUpdates ? t('library.refreshing') : t('updates.checkAll')}
            </button>
            <button
              type="button"
              className="hero-primary-btn"
              onClick={handleUpdateAllPortable}
              disabled={updateRepositories.length === 0 || checkingUpdates || batchUpdating}
            >
              {batchUpdating ? t('updates.updatingAll') : t('updates.updateAllPortable')}
            </button>
          </div>
        </div>

        <div className="updates-center-stats">
          <div>
            <span>{t('updates.available')}</span>
            <strong>{updateRepositories.length}</strong>
          </div>
          <div>
            <span>{t('updates.skipped')}</span>
            <strong>{skippedCount}</strong>
          </div>
          <div>
            <span>{t('updates.lastChecked')}</span>
            <strong>{formattedLatestVersionsTime ?? t('details.unknown')}</strong>
          </div>
        </div>

        {skippedCount > 0 && (
          <button
            type="button"
            className="updates-clear-skipped"
            onClick={handleClearSkippedUpdates}
          >
            {t('updates.showSkipped')}
          </button>
        )}

        {batchUpdateMessage && <div className="release-cleanup-note">{batchUpdateMessage}</div>}
        {batchCleanupMessage && <div className="release-cleanup-note">{batchCleanupMessage}</div>}
        {batchUpdateError && <div className="error-message">{batchUpdateError}</div>}

        {updateRepositories.length > 0 ? (
          <div className="updates-center-list">
            {updateRepositories.slice(0, 6).map((repo) => {
              const installedApp = getInstalledApp(repo)
              const latestVersion = getLatestVersion(repo)
              if (!installedApp || !latestVersion) return null

              return (
                <div key={`${repo.owner.login}/${repo.name}`} className="updates-center-row">
                  <div>
                    <strong>{repo.name}</strong>
                    <span>
                      {installedApp.activeVersion} {'->'} {latestVersion}
                    </span>
                  </div>
                  <div className="updates-center-row-actions">
                    <button type="button" className="secondary-btn" onClick={() => setSelectedRepo(repo)}>
                      {t('repo.updateAction')}
                    </button>
                    <button type="button" className="secondary-btn" onClick={() => setDetailsRepo(repo)}>
                      {t('details.open')}
                    </button>
                    <button type="button" className="secondary-btn" onClick={() => handleSkipUpdate(repo)}>
                      {t('updates.skip')}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="updates-center-empty">
            {t(updatesEmptyKey, { count: latestVersionErrorCount })}
          </p>
        )}

        <DownloadProgressPanel
          downloads={batchDownloads}
          onCancel={cancelBatchDownload}
          onLaunch={(download) => {
            if (!download.owner || !download.repo) return
            launchApp(download.owner, download.repo).catch(() => {})
          }}
          onOpenFolder={handleBatchOpenFolder}
          onRetry={handleBatchRetry}
          onChooseAnother={() => chooseAnotherRepo && setSelectedRepo(chooseAnotherRepo)}
          onCleanup={handleBatchCleanup}
        />
      </section>
    )
  }

  const renderLibraryTrustPanel = () => {
    const canRetry = !state.loading && !checkingUpdates
    const retryInstalled = Boolean(installedLoadError) && canRetry

    return (
      <section
        className={`library-trust-panel library-trust-panel--${libraryTrustKind}`}
        aria-live="polite"
      >
        <div className="library-trust-main">
          <span className="library-trust-kicker">{t('library.trust.kicker')}</span>
          <strong>{t(`library.trust.${libraryTrustKind}.title`, { count: latestVersionErrorCount })}</strong>
          <p>{t(`library.trust.${libraryTrustKind}.text`, { count: latestVersionErrorCount })}</p>
        </div>

        <div className="library-trust-meta" aria-label={t('library.trust.meta')}>
          <span>
            <strong>{t('library.trust.visible')}</strong>
            {t('library.count', {
              visible: visibleRepositories.length.toLocaleString(),
              total: state.repositories.length.toLocaleString(),
            })}
          </span>
          <span>
            <strong>{t('library.trust.data')}</strong>
            {formattedRefreshTime
              ? t(state.isStale ? 'refresh.staleAt' : 'refresh.updatedAt', { time: formattedRefreshTime })
              : t('library.trust.notLoaded')}
          </span>
          <span>
            <strong>{t('library.trust.versions')}</strong>
            {checkingUpdates
              ? t('library.trust.checkingVersions')
              : formattedLatestVersionsTime
                ? t('library.trust.versionsCheckedAt', { time: formattedLatestVersionsTime })
                : t('library.trust.notChecked')}
          </span>
        </div>

        {state.error && state.isStale && (
          <details className="library-trust-details">
            <summary>{t('state.details')}</summary>
            <pre>{state.error}</pre>
          </details>
        )}

        <div className="library-trust-actions">
          {(state.error || latestVersionErrorCount > 0 || !latestVersionsCheckedAt) && (
            <button
              type="button"
              className="secondary-btn"
              onClick={handleRefresh}
              disabled={!canRetry}
            >
              {state.loading || checkingUpdates ? t('library.refreshing') : t('library.trust.retry')}
            </button>
          )}
          {retryInstalled && (
            <button type="button" className="secondary-btn" onClick={() => refreshInstalledApps()}>
              {t('library.trust.retryInstalled')}
            </button>
          )}
        </div>
      </section>
    )
  }

  const renderHero = () => {
    if (!featuredRepo) return null

    const installedApp = getInstalledApp(featuredRepo)
    const latestVersion = getLatestVersion(featuredRepo)
    const hasUpdate = Boolean(
      installedApp &&
      latestVersion &&
      latestVersion !== installedApp.activeVersion,
    )
    const isInstalled = Boolean(installedApp)
    const isFavorite = favoriteKeys.has(projectArtKey(featuredRepo.owner.login, featuredRepo.name))
    const statusClass = hasUpdate ? 'update' : isInstalled ? 'installed' : 'available'
    const statusLabel = hasUpdate
      ? t('repo.update')
      : isInstalled
        ? t('repo.installed')
        : t('repo.available')
    const primaryLabel = hasUpdate
      ? t('repo.updateAction')
      : isInstalled
        ? t('repo.launch')
        : t('repo.install')
    const primaryAction = isInstalled && !hasUpdate
      ? () => handleLaunch(featuredRepo)
      : () => setSelectedRepo(featuredRepo)
    const handleOpenFolder = () => {
      openInstalledAppDir(featuredRepo.owner.login, featuredRepo.name)
        .catch((err) => setLaunchError(
          err instanceof Error ? err.message : t('installed.openFolderError'),
        ))
    }

    return (
      <section className="library-hero" aria-label={featuredRepo.name}>
        <div className="library-hero-cover">
          {featuredCover ? (
            <img src={featuredCover} alt="" />
          ) : (
            <img src={featuredRepo.owner.avatar_url} alt="" />
          )}
        </div>

        <div className="library-hero-main">
          <div className="repo-status-row">
            <span className={`repo-status ${statusClass}`}>{statusLabel}</span>
            {featuredRepo.language && <span className="repo-lang">{featuredRepo.language}</span>}
            <button
              type="button"
              className={`hero-favorite-btn ${isFavorite ? 'active' : ''}`}
              onClick={handleToggleFeaturedFavorite}
              disabled={favoriteBusy}
              title={isFavorite ? t('repo.removeFavorite') : t('repo.addFavorite')}
              aria-label={isFavorite ? t('repo.removeFavorite') : t('repo.addFavorite')}
            >
              {isFavorite ? '\u2605' : '\u2606'}
            </button>
          </div>
          <h2>{featuredRepo.name}</h2>
          <p className="library-hero-repo">{featuredRepo.owner.login}/{featuredRepo.name}</p>
          {featuredRepo.description && (
            <p className="library-hero-description">{featuredRepo.description}</p>
          )}
          <div className="library-hero-meta">
            <span>{t('repo.stars', { count: featuredRepo.stargazers_count.toLocaleString() })}</span>
            {installedApp && (
              <span>{t('repo.active', { version: installedApp.activeVersion })}</span>
            )}
            {hasUpdate && latestVersion && (
              <span>{t('repo.new', { version: latestVersion })}</span>
            )}
          </div>
          {artError && <p className="library-hero-error">{artError}</p>}
        </div>

        <div className="library-hero-actions">
          <button type="button" className="hero-primary-btn" onClick={primaryAction}>
            {primaryLabel}
          </button>
          <button type="button" className="secondary-btn" onClick={() => setSelectedRepo(featuredRepo)}>
            {t('repo.versions')}
          </button>
          <div
            className={`project-actions-menu hero-actions-menu ${heroActionsOpen ? 'open' : ''}`}
            ref={heroActionsRef}
          >
            <button
              type="button"
              className="project-actions-trigger"
              aria-haspopup="menu"
              aria-expanded={heroActionsOpen}
              aria-label={t('projectActions.open')}
              onClick={() => setHeroActionsOpen((current) => !current)}
            >
              ...
            </button>
            {heroActionsOpen && (
              <div className="project-actions-popover" role="menu" aria-label={t('art.actions')}>
                {isInstalled && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setHeroActionsOpen(false)
                      setDetailsRepo(featuredRepo)
                    }}
                  >
                    {t('details.open')}
                  </button>
                )}
                {isInstalled && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setHeroActionsOpen(false)
                      handleOpenFolder()
                    }}
                  >
                    {t('installed.folder')}
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setHeroActionsOpen(false)
                    onChangeLauncherBackground?.()
                  }}
                >
                  {t('art.changeLauncherBackground')}
                </button>
                <button type="button" role="menuitem" onClick={() => handlePickArt('cover')}>
                  {t('art.changeCover')}
                </button>
                {featuredArt?.coverPath && (
                  <button type="button" role="menuitem" onClick={() => handleClearArt()}>
                    {t('art.resetCover')}
                  </button>
                )}
                {hasLauncherBackground && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setHeroActionsOpen(false)
                      onClearLauncherBackground?.()
                    }}
                  >
                    {t('art.resetLauncherBackground')}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </section>
    )
  }

  const showLoadingState = owner && state.loading && state.repositories.length === 0

  return (
    <div className="page library-page">
      <div className="page-header">
        <h2>{t('library.title')}</h2>
        {owner && (
          <div className="page-actions">
            {refreshState === 'error' && (
              <span className="refresh-status error">{t('refresh.error')}</span>
            )}
            <button
              type="button"
              className="refresh-btn"
              onClick={handleRefresh}
              disabled={state.loading || checkingUpdates}
            >
              {state.loading || checkingUpdates ? t('library.refreshing') : t('library.refresh')}
            </button>
          </div>
        )}
      </div>

      {!owner && !settingsLoading && (
        <StatePanel
          kind="empty"
          title={t('library.noOwnerTitle')}
          message={t('library.noOwnerText')}
        />
      )}

      {owner && (
        <>
          {renderHero()}

          <div className="search-form">
            <label className="visually-hidden" htmlFor="library-search">
              {t('library.searchLabel')}
            </label>
            <input
              id="library-search"
              type="text"
              placeholder={t('library.searchPlaceholder')}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="search-input"
              aria-label={t('library.searchLabel')}
            />
          </div>

          <div className="library-controls">
            <div className="segmented-control" aria-label={t('library.filterLabel')}>
              {libraryFilters.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={filter === item ? 'active' : ''}
                  aria-pressed={filter === item}
                  title={t(libraryFilterLabelKey(item))}
                  onClick={() => setFilter(item)}
                >
                  {t(libraryFilterLabelKey(item))}
                </button>
              ))}
            </div>

            <label className="sort-control" htmlFor="library-sort" aria-label={t('library.sortLabel')}>
              <span className="visually-hidden">{t('library.sortLabel')}</span>
              <select
                id="library-sort"
                value={sort}
                onChange={(event) => setSort(event.target.value as LibrarySort)}
                aria-label={t('library.sortLabel')}
              >
                <option value="updated">{t('library.recentlyUpdated')}</option>
                <option value="status">{t('library.status')}</option>
                <option value="name">{t('library.name')}</option>
              </select>
            </label>
          </div>

          {renderLibraryTrustPanel()}

          {renderUpdatesCenter()}

          {state.error && !state.isStale && (
            <StatePanel
              kind="error"
              title={t(libraryErrorTitleKey(libraryErrorKind))}
              message={t(libraryErrorTextKey(libraryErrorKind))}
              details={state.error}
              detailsLabel={t('state.details')}
              actionLabel={t('library.tryAgain')}
              onAction={handleRefresh}
            />
          )}

          {installedLoadError && (
            <StatePanel
              kind="error"
              title={t('state.installedErrorTitle')}
              message={t('library.installedStatusErrorText')}
              details={installedLoadError}
              detailsLabel={t('state.details')}
              actionLabel={t('library.tryAgain')}
              onAction={() => refreshInstalledApps()}
            />
          )}

          {launchError && (
            <StatePanel
              kind="error"
              title={t('state.launchErrorTitle')}
              message={launchError}
            />
          )}

          <p className="results-count">
            {t('library.count', {
              visible: visibleRepositories.length.toLocaleString(),
              total: state.repositories.length.toLocaleString(),
            })}
          </p>

          <div className="search-results">
            {showLoadingState && (
              <StatePanel kind="loading" title={t('library.loading')} skeletonCount={3} />
            )}

            {visibleRepositories.length === 0 && !state.loading && (
              <StatePanel
                kind="empty"
                title={state.repositories.length === 0
                  ? t('library.emptyTitle')
                  : t('library.noMatchesTitle')}
                message={state.repositories.length === 0
                  ? t('library.emptyText')
                  : t('library.noMatchesText')}
                actionLabel={state.repositories.length === 0 ? t('library.refresh') : undefined}
                onAction={state.repositories.length === 0 ? handleRefresh : undefined}
              />
            )}

            {visibleRepositories.map((repo) => {
              const key = projectArtKey(repo.owner.login, repo.name)

              return (
                <RepoCard
                  key={repo.id}
                  repo={repo}
                  installedApp={getInstalledApp(repo)}
                  latestVersion={getLatestVersion(repo)}
                  art={projectArt[key]}
                  isFavorite={favoriteKeys.has(key)}
                  isSelected={featuredRepo?.id === repo.id || recentlyInstalledKey === key}
                  onPreview={() => setFeaturedRepo(repo)}
                  onFavoriteChange={(nextValue) => handleFavoriteChange(repo, nextValue)}
                  onPickArt={() => handlePickArt('cover', repo)}
                  onClearArt={() => handleClearArt(repo)}
                  onDetails={() => setDetailsRepo(repo)}
                  onSelect={() => setSelectedRepo(repo)}
                  onLaunch={() => handleLaunch(repo)}
                />
              )
            })}
          </div>

          {state.hasMore && !state.loading && (
            <button type="button" onClick={loadMore} className="load-more-btn">
              {t('library.loadMore')}
            </button>
          )}
        </>
      )}

      {selectedRepo && (
        <ReleaseSelector
          owner={selectedRepo.owner.login}
          repo={selectedRepo.name}
          displayName={selectedRepo.name}
          description={selectedRepo.description ?? undefined}
          currentVersion={getInstalledApp(selectedRepo)?.activeVersion}
          onClose={() => setSelectedRepo(null)}
          onInstalled={handleInstalledFromRelease}
        />
      )}

      {detailsRepo && getInstalledApp(detailsRepo) && (
        <AppDetailsModal
          repo={detailsRepo}
          installedApp={getInstalledApp(detailsRepo)!}
          latestVersion={getLatestVersion(detailsRepo)}
          onClose={() => setDetailsRepo(null)}
          onChanged={async () => {
            const freshInstalledApps = await refreshInstalledApps()
            await refreshLatestVersions(freshInstalledApps, state.repositories)
          }}
          onInstallVersion={() => {
            setDetailsRepo(null)
            setSelectedRepo(detailsRepo)
          }}
        />
      )}
    </div>
  )
}

export default SearchPage
