import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useOwnerRepositories, usePublicRepositories } from './hooks/useGitHub'
import { useSettings } from '../../hooks/useSettings'
import { useLibraryStatus } from './hooks/useLibraryStatus'
import { useDownload } from '../../hooks/useDownload'
import RepoCard from './components/RepoCard'
import ReleaseSelector from '../../components/Install/ReleaseSelector'
import UninstallConfirmModal from './components/UninstallConfirmModal'
import DownloadProgressPanel from '../../components/Install/DownloadProgress'
import StatePanel from '../../components/State/StatePanel'
import { cleanupIncompleteInstalls, launchApp, openInstalledAppDir, uninstallApp } from '../../services/installed'
import { getReleases } from '../../services/github'
import { addToFavorites, getFavorites, removeFromFavorites } from '../../services/favorites'
import { pickImageFile } from '../../services/dialog'
import {
  clearProjectArt,
  listProjectArt,
  projectArtCoverUrl,
  projectArtBackgroundUrl,
  projectArtKey,
  setProjectArt,
} from '../../services/projectArt'
import type { DownloadProgress, FavoriteApp, GitHubAsset, GitHubRelease, GitHubSearchResult, InstalledApp, ProjectArt } from '../../types'
import { useI18n } from '../../i18n'
import '../../pages/PageStyles.css'

type LibraryFilter = 'all' | 'installed' | 'favorites' | 'updates' | 'available'
type LibrarySort = 'updated' | 'name' | 'status'
type LibraryPageMode = 'store' | 'library'
type LibraryErrorKind = 'rateLimit' | 'offline' | 'notFound' | 'generic'
type LibraryTrustKind = 'fresh' | 'checking' | 'cached' | 'rateLimit' | 'offline' | 'partial'
type HeroPanel = 'overview' | 'versions' | 'details'
type BatchUpdateJob = {
  url: string
  fileName: string
  owner: string
  repo: string
  tag: string
}
type UninstallTarget = {
  repo: GitHubSearchResult
  installedApp: InstalledApp
}

function repoLookupKey(owner: string, repo: string) {
  return `${owner}/${repo}`.toLowerCase()
}

function syntheticRepoId(owner: string, repo: string) {
  const key = repoLookupKey(owner, repo)
  let hash = 0
  for (let index = 0; index < key.length; index += 1) {
    hash = ((hash << 5) - hash) + key.charCodeAt(index)
    hash |= 0
  }
  return -Math.abs(hash || 1)
}

function latestInstalledAt(app: InstalledApp) {
  const sortedDates = app.versions
    .map((version) => version.installedAt)
    .filter(Boolean)
    .sort()
  return sortedDates[sortedDates.length - 1] ?? new Date(0).toISOString()
}

function makeInstalledRepository(app: InstalledApp, favorite?: FavoriteApp): GitHubSearchResult {
  return {
    id: syntheticRepoId(app.owner, app.repo),
    name: app.repo,
    full_name: `${app.owner}/${app.repo}`,
    owner: {
      login: app.owner,
      avatar_url: '',
    },
    description: favorite?.description ?? null,
    stargazers_count: 0,
    updated_at: latestInstalledAt(app),
    html_url: `https://github.com/${app.owner}/${app.repo}`,
    language: null,
    topics: null,
    has_releases: true,
    fork: false,
    archived: false,
    private: false,
  }
}

function makeFavoriteRepository(favorite: FavoriteApp): GitHubSearchResult {
  return {
    id: syntheticRepoId(favorite.owner, favorite.repo),
    name: favorite.repo,
    full_name: `${favorite.owner}/${favorite.repo}`,
    owner: {
      login: favorite.owner,
      avatar_url: '',
    },
    description: favorite.description ?? null,
    stargazers_count: 0,
    updated_at: favorite.lastChecked ?? new Date(0).toISOString(),
    html_url: `https://github.com/${favorite.owner}/${favorite.repo}`,
    language: null,
    topics: null,
    has_releases: true,
    fork: false,
    archived: false,
    private: false,
  }
}

const storeFilters: LibraryFilter[] = ['all', 'installed', 'favorites', 'updates', 'available']
const libraryFilters: LibraryFilter[] = ['all', 'installed', 'favorites', 'updates']

function libraryFilterLabelKey(filter: LibraryFilter) {
  return filter === 'available' ? 'library.availableFilter' : `library.${filter}`
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

interface LibraryPageProps {
  mode?: LibraryPageMode
  onOpenSettings?: () => void
  onOpenStore?: () => void
  onOpenAiWorkspace?: (repo: GitHubSearchResult) => void
  onPreviewBackground?: (url: string | null) => void
}

function LibraryPage({
  mode = 'store',
  onOpenSettings,
  onOpenStore,
  onOpenAiWorkspace,
  onPreviewBackground,
}: LibraryPageProps) {
  const { language, t } = useI18n()
  const isLibraryMode = mode === 'library'
  const pageKey = isLibraryMode ? 'library' : 'store'
  const activeFilters = isLibraryMode ? libraryFilters : storeFilters
  const [query, setQuery] = useState('')
  const [storeSearchQuery, setStoreSearchQuery] = useState('')
  const [filter, setFilter] = useState<LibraryFilter>('all')
  const [sort, setSort] = useState<LibrarySort>('updated')
  const [selectedRepo, setSelectedRepo] = useState<GitHubSearchResult | null>(null)
  const [featuredRepo, setFeaturedRepo] = useState<GitHubSearchResult | null>(null)
  const [heroPanel, setHeroPanel] = useState<HeroPanel>('overview')
  const [recentlyInstalledKey, setRecentlyInstalledKey] = useState<string | null>(null)
  const [projectArt, setProjectArtState] = useState<Record<string, ProjectArt>>({})
  const [favoriteKeys, setFavoriteKeys] = useState<Set<string>>(new Set())
  const [favorites, setFavorites] = useState<FavoriteApp[]>([])
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
  const [libraryTrustExpanded, setLibraryTrustExpanded] = useState(false)
  const [uninstallTarget, setUninstallTarget] = useState<UninstallTarget | null>(null)
  const [uninstallBusy, setUninstallBusy] = useState(false)
  const [uninstallError, setUninstallError] = useState<string | null>(null)
  const [libraryActionMessage, setLibraryActionMessage] = useState<string | null>(null)
  const { settings, loading: settingsLoading } = useSettings()
  const {
    downloads: batchDownloads,
    download: startBatchDownload,
    cancel: cancelBatchDownload,
  } = useDownload()
  const heroActionsRef = useRef<HTMLDivElement | null>(null)
  const owner = settings.githubOwner?.trim()
  const ownerRepositories = useOwnerRepositories(owner)
  const publicRepositories = usePublicRepositories(isLibraryMode ? '' : storeSearchQuery)
  const {
    state,
    loadRepositories,
    refreshRepositories,
    loadMore,
  } = isLibraryMode ? ownerRepositories : publicRepositories
  const {
    checkingUpdates,
    latestVersionErrorCount,
    latestVersionsCheckedAt,
    installedLoadError,
    installedApps,
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

  const handleRequestUninstall = (repo: GitHubSearchResult) => {
    const installedApp = getInstalledApp(repo)
    if (!installedApp) return

    setHeroActionsOpen(false)
    setUninstallError(null)
    setUninstallTarget({ repo, installedApp })
  }

  const handleConfirmUninstall = async () => {
    if (!uninstallTarget) return

    setUninstallBusy(true)
    setUninstallError(null)
    try {
      await uninstallApp(uninstallTarget.installedApp.owner, uninstallTarget.installedApp.repo)
      setLibraryActionMessage(t('installed.uninstallDone', { name: uninstallTarget.repo.name }))
      setUninstallTarget(null)
      await refreshLocalStatus()
    } catch (err) {
      setUninstallError(err instanceof Error ? err.message : t('installed.uninstallError'))
    } finally {
      setUninstallBusy(false)
    }
  }

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

  const handleResetLibraryFilters = () => {
    setQuery('')
    setFilter('all')
    setSort('updated')
  }

  useEffect(() => {
    if (!activeFilters.includes(filter)) {
      setFilter('all')
    }
  }, [activeFilters, filter])

  const selectFeaturedRepo = useCallback((repo: GitHubSearchResult, panel: HeroPanel = 'overview') => {
    setHeroActionsOpen(false)
    setFeaturedRepo(repo)
    setHeroPanel(panel)
  }, [])

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
    if (isLibraryMode) {
      setStoreSearchQuery('')
      return
    }

    const timer = window.setTimeout(() => {
      setStoreSearchQuery(query.trim())
    }, 350)

    return () => window.clearTimeout(timer)
  }, [isLibraryMode, query])

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
    const items = await getFavorites()
    setFavorites(items)
    setFavoriteKeys(new Set(items.map((item) => projectArtKey(item.owner, item.repo))))
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
    if (!libraryActionMessage) return
    const timer = window.setTimeout(() => setLibraryActionMessage(null), 4200)
    return () => window.clearTimeout(timer)
  }, [libraryActionMessage])

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

  const libraryRepositories = useMemo(() => {
    if (!isLibraryMode) return state.repositories

    const reposByKey = new Map(
      state.repositories.map((repo) => [repoLookupKey(repo.owner.login, repo.name), repo]),
    )
    const favoritesByKey = new Map(
      favorites.map((favorite) => [repoLookupKey(favorite.owner, favorite.repo), favorite]),
    )

    installedApps.forEach((app) => {
      const key = repoLookupKey(app.owner, app.repo)
      if (!reposByKey.has(key)) {
        reposByKey.set(key, makeInstalledRepository(app, favoritesByKey.get(key)))
      }
    })

    favorites.forEach((favorite) => {
      const key = repoLookupKey(favorite.owner, favorite.repo)
      if (!reposByKey.has(key)) {
        reposByKey.set(key, makeFavoriteRepository(favorite))
      }
    })

    return Array.from(reposByKey.values())
  }, [favorites, installedApps, isLibraryMode, state.repositories])

  const updateRepositories = useMemo(() => {
    return libraryRepositories.filter((repo) => {
      const installedApp = getInstalledApp(repo)
      const latestVersion = getLatestVersion(repo)
      if (!installedApp || !latestVersion || latestVersion === installedApp.activeVersion) return false
      return !dismissedUpdateKeys.has(updateDismissKey(repo, latestVersion))
    })
  }, [dismissedUpdateKeys, getInstalledApp, getLatestVersion, libraryRepositories])

  const visibleRepositories = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    const filtered = libraryRepositories.filter((repo) => {
      const installedApp = getInstalledApp(repo)
      const latestVersion = getLatestVersion(repo)
      const isFavorite = favoriteKeys.has(projectArtKey(repo.owner.login, repo.name))
      const belongsToLibrary = Boolean(installedApp) || isFavorite
      const hasUpdate = Boolean(
        installedApp &&
        latestVersion &&
        latestVersion !== installedApp.activeVersion,
      )
      const updateDismissed = Boolean(
        latestVersion && dismissedUpdateKeys.has(updateDismissKey(repo, latestVersion)),
      )

      if (isLibraryMode && !belongsToLibrary) return false
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
  }, [dismissedUpdateKeys, favoriteKeys, filter, getInstalledApp, getLatestVersion, isLibraryMode, libraryRepositories, query, sort])

  const modeRepositoryCount = useMemo(() => {
    if (!isLibraryMode) return libraryRepositories.length

    return libraryRepositories.filter((repo) => {
      const installedApp = getInstalledApp(repo)
      const isFavorite = favoriteKeys.has(projectArtKey(repo.owner.login, repo.name))
      return Boolean(installedApp) || isFavorite
    }).length
  }, [favoriteKeys, getInstalledApp, isLibraryMode, libraryRepositories])

  useEffect(() => {
    if (visibleRepositories.length === 0) {
      setFeaturedRepo(null)
      setHeroPanel('overview')
      return
    }

    if (
      !featuredRepo ||
      !visibleRepositories.some((repo) => repo.id === featuredRepo.id)
    ) {
      setFeaturedRepo(visibleRepositories[0])
      setHeroPanel('overview')
    }
  }, [featuredRepo, visibleRepositories])

  useEffect(() => {
    setHeroActionsOpen(false)
  }, [featuredRepo?.id])

  const featuredArt = featuredRepo
    ? projectArt[projectArtKey(featuredRepo.owner.login, featuredRepo.name)]
    : undefined
  const featuredCover = projectArtCoverUrl(featuredArt)
  const featuredBackground = projectArtBackgroundUrl(featuredArt)

  useEffect(() => {
    onPreviewBackground?.(featuredBackground)
  }, [featuredBackground, onPreviewBackground])

  useEffect(() => {
    return () => onPreviewBackground?.(null)
  }, [onPreviewBackground])

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
                    <button type="button" className="secondary-btn" onClick={() => selectFeaturedRepo(repo, 'details')}>
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
    const shouldOfferRetry = state.error || latestVersionErrorCount > 0 || !latestVersionsCheckedAt
    const showInlineRetry = shouldOfferRetry && libraryTrustKind !== 'fresh' && libraryTrustKind !== 'checking'

    return (
      <section
        className={`library-trust-panel library-trust-panel--${libraryTrustKind} ${libraryTrustExpanded ? 'expanded' : ''}`}
        aria-live="polite"
      >
        <span className="library-trust-mark" aria-hidden="true" />
        <div className="library-trust-summary">
          <span className="library-trust-kicker">{t('library.trust.kicker')}</span>
          <div className="library-trust-copy">
            <strong>{t(`library.trust.${libraryTrustKind}.title`, { count: latestVersionErrorCount })}</strong>
            <span>
              {t('library.trust.visible')}: {t(`${pageKey}.count`, {
                visible: visibleRepositories.length.toLocaleString(),
                total: modeRepositoryCount.toLocaleString(),
              })}
            </span>
            {formattedLatestVersionsTime && (
              <span>{t('library.trust.versionsCheckedAt', { time: formattedLatestVersionsTime })}</span>
            )}
          </div>
        </div>
        <div className="library-trust-inline-actions">
          {showInlineRetry && (
            <button
              type="button"
              className="secondary-btn"
              onClick={handleRefresh}
              disabled={!canRetry}
            >
              {state.loading || checkingUpdates ? t('library.refreshing') : t('library.trust.retry')}
            </button>
          )}
          <button
            type="button"
            className="library-trust-toggle"
            aria-expanded={libraryTrustExpanded}
            onClick={() => setLibraryTrustExpanded((expanded) => !expanded)}
          >
            {t(libraryTrustExpanded ? 'library.trust.collapse' : 'library.trust.expand')}
          </button>
        </div>

        {libraryTrustExpanded && (
          <div className="library-trust-expanded">
            <p>{t(`library.trust.${libraryTrustKind}.text`, { count: latestVersionErrorCount })}</p>
            <div className="library-trust-meta" aria-label={t('library.trust.meta')}>
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
              {shouldOfferRetry && !showInlineRetry && (
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
          </div>
        )}
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
      <section
        className={`library-hero library-github-header ${featuredCover ? 'library-hero--art' : 'library-hero--fallback'}`}
        aria-label={featuredRepo.name}
      >
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

        <div className="library-hero-actions library-github-actions">
          <button type="button" className="hero-primary-btn" onClick={primaryAction}>
            {primaryLabel}
          </button>
          <button type="button" className={`secondary-btn ${heroPanel === 'versions' ? 'active-soft' : ''}`} onClick={() => setHeroPanel('versions')}>
            {t('repo.versions')}
          </button>
          <button type="button" className={`secondary-btn ${heroPanel === 'details' ? 'active-soft' : ''}`} onClick={() => setHeroPanel('details')}>
            {t('details.open')}
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
              <div className="project-actions-popover" role="menu" aria-label={t(isInstalled ? 'installed.moreActions' : 'art.actions')}>
                {isInstalled && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setHeroActionsOpen(false)
                      setHeroPanel('details')
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
                    onOpenAiWorkspace?.(featuredRepo)
                  }}
                >
                  {t('ai.openInWorkspace')}
                </button>
                <button type="button" role="menuitem" onClick={() => handlePickArt('cover')}>
                  {t('art.changeCover')}
                </button>
                {featuredArt?.coverPath && (
                  <button type="button" role="menuitem" onClick={() => handleClearArt()}>
                    {t('art.resetCover')}
                  </button>
                )}
                {isInstalled && (
                  <button
                    type="button"
                    role="menuitem"
                    className="danger-menu-item"
                    onClick={() => handleRequestUninstall(featuredRepo)}
                  >
                    {t('installed.uninstallApp')}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </section>
    )
  }

  const renderOperationsPanel = () => {
    if (!featuredRepo) return null

    const installedApp = getInstalledApp(featuredRepo)
    const latestVersion = getLatestVersion(featuredRepo)
    const hasUpdate = Boolean(
      installedApp &&
      latestVersion &&
      latestVersion !== installedApp.activeVersion,
    )
    const isFavorite = favoriteKeys.has(projectArtKey(featuredRepo.owner.login, featuredRepo.name))
    const updatedDate = new Date(featuredRepo.updated_at).toLocaleDateString(language === 'en' ? 'en-US' : 'uk-UA')
    const localVersionCount = installedApp?.versions.length ?? 0
    const installPath = settings.installationPath && installedApp
      ? `${settings.installationPath}\\${installedApp.owner}-${installedApp.repo}`
      : null
    const localVersions = installedApp?.versions ?? []

    const renderInlinePanel = () => {
      if (heroPanel === 'overview') return null

      if (heroPanel === 'versions') {
        return (
          <section className="library-inline-panel library-inline-panel--versions" aria-label={t('repo.versions')}>
            <div className="library-inline-panel-head">
              <div>
                <span>{t('repo.versions')}</span>
                <strong>{featuredRepo.name}</strong>
              </div>
              <button type="button" className="secondary-btn" onClick={() => setHeroPanel('overview')}>
                {t('library.trust.collapse')}
              </button>
            </div>
            <div className="library-inline-summary">
              <div>
                <span>{t('details.activeVersion')}</span>
                <strong>{installedApp?.activeVersion ?? t('release.notInstalled')}</strong>
              </div>
              <div>
                <span>{t('details.latestVersion')}</span>
                <strong>{latestVersion ?? t('library.ops.notChecked')}</strong>
              </div>
              <div>
                <span>{t('details.localVersions')}</span>
                <strong>{localVersionCount.toLocaleString()}</strong>
              </div>
              <button type="button" className="secondary-btn" onClick={() => setSelectedRepo(featuredRepo)}>
                {hasUpdate ? t('repo.updateAction') : t('repo.versions')}
              </button>
            </div>
            <div className="library-inline-version-list">
              {localVersions.length > 0 ? localVersions.map((version) => {
                const isActive = version.tag === installedApp?.activeVersion
                const versionDate = new Date(version.installedAt).toLocaleDateString(language === 'en' ? 'en-US' : 'uk-UA')
                return (
                  <div key={version.tag} className={`library-inline-version-row ${isActive ? 'active' : ''}`}>
                    <div>
                      <strong>{version.tag}</strong>
                      <span>{versionDate}</span>
                    </div>
                    <span>{isActive ? t('installed.active') : t('details.versionStateOlder')}</span>
                  </div>
                )
              }) : (
                <p className="library-inline-empty">{t('release.notInstalled')}</p>
              )}
            </div>
          </section>
        )
      }

      return (
        <section className="library-inline-panel library-inline-panel--details" aria-label={t('details.open')}>
          <div className="library-inline-panel-head">
            <div>
              <span>{t('details.kicker')}</span>
              <strong>{featuredRepo.full_name}</strong>
            </div>
            <button type="button" className="secondary-btn" onClick={() => setHeroPanel('overview')}>
              {t('library.trust.collapse')}
            </button>
          </div>
          <div className="library-inline-summary library-inline-summary--details">
            <div>
              <span>{t('library.ops.owner')}</span>
              <strong>{featuredRepo.owner.login}</strong>
            </div>
            <div>
              <span>{t('library.ops.updated')}</span>
              <strong>{updatedDate}</strong>
            </div>
            <div>
              <span>{t('library.ops.language')}</span>
              <strong>{featuredRepo.language ?? t('details.unknown')}</strong>
            </div>
            <div>
              <span>{t('library.ops.stars')}</span>
              <strong>{featuredRepo.stargazers_count.toLocaleString()}</strong>
            </div>
            <div>
              <span>{t('release.installPath')}</span>
              <strong>{installPath ?? t('details.unknown')}</strong>
            </div>
            <div>
              <span>{t('library.ops.latest')}</span>
              <strong>{latestVersion ?? t('library.ops.notChecked')}</strong>
            </div>
          </div>
        </section>
      )
    }

    return (
      <>
        <section className={`library-ops-panel ${hasUpdate ? 'update' : installedApp ? 'installed' : 'available'}`} aria-label={t('library.ops.title')}>
          <div className="library-ops-header">
            <div>
              <span className="library-ops-kicker">{t('library.ops.kicker')}</span>
              <h3>{t('library.ops.title')}</h3>
            </div>
            <span className={`library-ops-state ${hasUpdate ? 'update' : installedApp ? 'installed' : 'available'}`}>
              {hasUpdate ? t('repo.update') : installedApp ? t('repo.installed') : t('repo.available')}
            </span>
          </div>

          <div className="library-ops-grid">
            <div>
              <span>{t('library.ops.owner')}</span>
              <strong>{featuredRepo.owner.login}</strong>
            </div>
            <div>
              <span>{t('library.ops.updated')}</span>
              <strong>{updatedDate}</strong>
            </div>
            <div>
              <span>{t('library.ops.language')}</span>
              <strong>{featuredRepo.language ?? t('details.unknown')}</strong>
            </div>
            <div>
              <span>{t('library.ops.localVersions')}</span>
              <strong>{localVersionCount.toLocaleString()}</strong>
            </div>
            <div>
              <span>{t('library.ops.active')}</span>
              <strong>{installedApp?.activeVersion ?? t('library.ops.notInstalled')}</strong>
            </div>
            <div>
              <span>{t('library.ops.latest')}</span>
              <strong>{latestVersion ?? t('library.ops.notChecked')}</strong>
            </div>
          </div>

          <div className="library-ops-action-row" aria-label={t('library.action')}>
            <button type="button" className="hero-primary-btn" onClick={installedApp && !hasUpdate ? () => handleLaunch(featuredRepo) : () => setSelectedRepo(featuredRepo)}>
              {hasUpdate ? t('repo.updateAction') : installedApp ? t('repo.launch') : t('repo.install')}
            </button>
            <div className="library-play-status">
              <span>{t('library.ops.updated')}</span>
              <strong>{updatedDate}</strong>
            </div>
            <div className="library-play-status">
              <span>{t('library.ops.active')}</span>
              <strong>{installedApp?.activeVersion ?? t('library.ops.notInstalled')}</strong>
            </div>
            <div className="library-play-status">
              <span>{t('library.ops.language')}</span>
              <strong>{featuredRepo.language ?? t('details.unknown')}</strong>
            </div>
          </div>

          <div className="library-ops-tabs" aria-label={t('details.open')}>
            <button type="button" className={`secondary-btn ${heroPanel === 'versions' ? 'active-soft' : ''}`} onClick={() => setHeroPanel('versions')}>
              {t('repo.versions')}
            </button>
            {installedApp && (
              <button type="button" className={`secondary-btn ${heroPanel === 'details' ? 'active-soft' : ''}`} onClick={() => setHeroPanel('details')}>
                {t('details.open')}
              </button>
            )}
            <button type="button" className="secondary-btn" onClick={() => onOpenAiWorkspace?.(featuredRepo)}>
              {t('ai.openInWorkspace')}
            </button>
          </div>

          <div className="library-ops-rail">
            <span className={featuredRepo.has_releases ? 'ready' : 'muted'}>{t('library.ops.releases')}</span>
            <span className={isFavorite ? 'ready' : 'muted'}>{t('library.ops.favorite')}</span>
            <span className={featuredRepo.archived ? 'warning' : 'ready'}>{featuredRepo.archived ? t('library.ops.archived') : t('library.ops.activeRepo')}</span>
            <span className={featuredRepo.fork ? 'muted' : 'ready'}>{featuredRepo.fork ? t('library.ops.fork') : t('library.ops.sourceRepo')}</span>
          </div>
        </section>

        {renderInlinePanel()}
      </>
    )
  }

  const requiresOwner = false
  const showLoadingState = state.loading && libraryRepositories.length === 0
  const emptyTitleKey = modeRepositoryCount === 0
    ? `${pageKey}.emptyTitle`
    : `${pageKey}.noMatchesTitle`
  const emptyTextKey = modeRepositoryCount === 0
    ? `${pageKey}.emptyText`
    : `${pageKey}.noMatchesText`
  const emptyActionLabel = modeRepositoryCount === 0
    ? isLibraryMode && onOpenStore
      ? t('store.open')
      : t(`${pageKey}.refresh`)
    : t(`${pageKey}.resetFilters`)
  const emptyAction = modeRepositoryCount === 0
    ? isLibraryMode && onOpenStore
      ? onOpenStore
      : handleRefresh
    : handleResetLibraryFilters

  return (
    <div className="page library-page">
      <div className="page-header">
        <h2>{t(`${pageKey}.title`)}</h2>
        {!requiresOwner && (
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
              {state.loading || checkingUpdates ? t(`${pageKey}.refreshing`) : t(`${pageKey}.refresh`)}
            </button>
          </div>
        )}
      </div>

      {requiresOwner && !settingsLoading && (
        <StatePanel
          kind="empty"
          title={t(`${pageKey}.noOwnerTitle`)}
          message={t(`${pageKey}.noOwnerText`)}
          actionLabel={onOpenSettings ? t(`${pageKey}.openSettings`) : undefined}
          onAction={onOpenSettings}
        />
      )}

      {!requiresOwner && (
        <div className="library-sam-workspace">
          <section className="library-sam-list-pane" aria-label={t(`${pageKey}.title`)}>
            <div className="library-sam-pane-head">
              <div>
                <span className="library-sam-kicker">
                  {isLibraryMode ? t('library.localSource') : t('store.globalSource')}
                </span>
                <h3>{t(`${pageKey}.title`)}</h3>
              </div>
              <p className="results-count">
                {t(`${pageKey}.count`, {
                  visible: visibleRepositories.length.toLocaleString(),
                  total: modeRepositoryCount.toLocaleString(),
                })}
              </p>
            </div>

            <section className="library-toolstrip" aria-label={t(`${pageKey}.filterLabel`)}>
              <div className="search-form">
                <label className="visually-hidden" htmlFor="library-search">
                  {t(`${pageKey}.searchLabel`)}
                </label>
                <input
                  id="library-search"
                  type="text"
                  placeholder={t(`${pageKey}.searchPlaceholder`)}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="search-input"
                  aria-label={t(`${pageKey}.searchLabel`)}
                />
              </div>

              <div className="library-controls">
                <div className="segmented-control" aria-label={t(`${pageKey}.filterLabel`)}>
                  {activeFilters.map((item) => (
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

                <label className="sort-control" htmlFor="library-sort" aria-label={t(`${pageKey}.sortLabel`)}>
                  <span className="visually-hidden">{t(`${pageKey}.sortLabel`)}</span>
                  <select
                    id="library-sort"
                    value={sort}
                    onChange={(event) => setSort(event.target.value as LibrarySort)}
                    aria-label={t(`${pageKey}.sortLabel`)}
                  >
                    <option value="updated">{t('library.recentlyUpdated')}</option>
                    <option value="status">{t('library.status')}</option>
                    <option value="name">{t('library.name')}</option>
                  </select>
                </label>
              </div>
            </section>

            {renderLibraryTrustPanel()}

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

            <div className="search-results">
              <div className="library-results-header" aria-hidden="true">
                <span>{t('library.name')}</span>
                <span>{t('nav.source')}</span>
                <span>{t('library.status')}</span>
                <span>{t('library.action')}</span>
              </div>

              {showLoadingState && (
                <StatePanel kind="loading" title={t(`${pageKey}.loading`)} skeletonCount={3} />
              )}

              {visibleRepositories.length === 0 && !state.loading && (
                <StatePanel
                  kind="empty"
                  title={t(emptyTitleKey)}
                  message={t(emptyTextKey)}
                  actionLabel={emptyActionLabel}
                  onAction={emptyAction}
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
                    onPreview={() => selectFeaturedRepo(repo)}
                    onFavoriteChange={(nextValue) => handleFavoriteChange(repo, nextValue)}
                    onPickArt={() => handlePickArt('cover', repo)}
                    onClearArt={() => handleClearArt(repo)}
                    onAiWorkspace={() => onOpenAiWorkspace?.(repo)}
                    onUninstall={() => handleRequestUninstall(repo)}
                    onInstall={() => setSelectedRepo(repo)}
                    onLaunch={() => handleLaunch(repo)}
                  />
                )
              })}
            </div>

            {!isLibraryMode && state.hasMore && (
              <button type="button" onClick={loadMore} className="load-more-btn" disabled={state.loading}>
                {state.loading ? t('library.loadingMore') : t('library.loadMore')}
              </button>
            )}
          </section>

          <aside className="library-sam-details-pane" aria-label={featuredRepo?.name ?? t('details.open')}>
            <div className="library-sam-details-toolbar">
              <span>{t('details.open')}</span>
              {!requiresOwner && (
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={handleRefresh}
                  disabled={state.loading || checkingUpdates}
                >
                  {state.loading || checkingUpdates ? t('library.refreshing') : t('library.refresh')}
                </button>
              )}
            </div>
            {renderHero()}
            {renderOperationsPanel()}
            {renderUpdatesCenter()}
          </aside>
        </div>
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

      {uninstallTarget && (
        <UninstallConfirmModal
          installedApp={uninstallTarget.installedApp}
          appPath={settings.installationPath
            ? `${settings.installationPath}\\${uninstallTarget.installedApp.owner}-${uninstallTarget.installedApp.repo}`
            : ''}
          scope="app"
          busy={uninstallBusy}
          error={uninstallError}
          onCancel={() => {
            if (!uninstallBusy) {
              setUninstallTarget(null)
              setUninstallError(null)
            }
          }}
          onConfirm={handleConfirmUninstall}
        />
      )}

      {libraryActionMessage && (
        <div className="library-toast library-toast--success" role="status">
          {libraryActionMessage}
        </div>
      )}
    </div>
  )
}

export default LibraryPage
