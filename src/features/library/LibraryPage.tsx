import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useOwnerRepositories } from './hooks/useGitHub'
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
import { getLibraryFolders, saveLibraryFolders } from '../../services/libraryFolders'
import { pickImageFile } from '../../services/dialog'
import {
  clearProjectArt,
  listProjectArt,
  projectArtCoverUrl,
  projectArtBackgroundUrl,
  projectArtKey,
  setProjectArt,
} from '../../services/projectArt'
import type { DownloadProgress, FavoriteApp, GitHubAsset, GitHubRelease, GitHubSearchResult, InstalledApp, LibraryFolder, ProjectArt } from '../../types'
import { useI18n } from '../../i18n'
import '../../pages/PageStyles.css'

type LibraryFilter = 'all' | 'installed' | 'favorites' | 'updates' | 'available'
type LibrarySort = 'updated' | 'name' | 'status'
type LibraryViewMode = 'home' | 'recent' | 'ready'
type LibraryErrorKind = 'rateLimit' | 'offline' | 'notFound' | 'generic'
type LibraryTrustKind = 'fresh' | 'checking' | 'cached' | 'rateLimit' | 'offline' | 'partial'
type HeroPanel = 'overview' | 'versions' | 'details'
type LibrarySection = {
  id: string
  title: string
  repositories: GitHubSearchResult[]
  pinned?: boolean
}
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

function isLauncherRepository(owner: string, repo: string) {
  return owner.trim().toLowerCase() === 'cpprice11' &&
    repo.trim().toLowerCase() === 'pullora'
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

const favoritesFolderId = 'favorites'

function normalizeRepoKey(owner: string, repo: string) {
  return projectArtKey(owner, repo)
}

function normalizeFolderName(name: string) {
  return name.trim().replace(/\s+/g, ' ')
}

function createFavoritesFolder(repoKeys: string[] = []): LibraryFolder {
  return {
    id: favoritesFolderId,
    name: 'Favorites',
    repoKeys: Array.from(new Set(repoKeys)),
    pinned: true,
  }
}

function ensureFavoritesFolder(folders: LibraryFolder[]) {
  const favoriteFolder = folders.find((folder) => folder.id === favoritesFolderId)
  const otherFolders = folders.filter((folder) => folder.id !== favoritesFolderId)

  return [
    {
      ...(favoriteFolder ?? createFavoritesFolder()),
      id: favoritesFolderId,
      pinned: true,
      repoKeys: Array.from(new Set(favoriteFolder?.repoKeys ?? [])),
    },
    ...otherFolders.map((folder) => ({
      ...folder,
      repoKeys: Array.from(new Set(folder.repoKeys ?? [])),
    })),
  ]
}

function makeFolderId(name: string) {
  return `folder-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'custom'}-${Date.now()}`
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
  onOpenSettings?: () => void
  onPreviewBackground?: (url: string | null) => void
  suppressDiagnostics?: boolean
}

function LibraryPage({
  onOpenSettings,
  onPreviewBackground,
  suppressDiagnostics = false,
}: LibraryPageProps) {
  const { language, t } = useI18n()
  const pageKey = 'library'
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<LibraryFilter>('all')
  const [sort, setSort] = useState<LibrarySort>('updated')
  const [viewMode, setViewMode] = useState<LibraryViewMode>('home')
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null)
  const [libraryFolders, setLibraryFolders] = useState<LibraryFolder[]>(() => ensureFavoritesFolder([]))
  const [folderDialogOpen, setFolderDialogOpen] = useState(false)
  const [folderDialogRepo, setFolderDialogRepo] = useState<GitHubSearchResult | null>(null)
  const [folderName, setFolderName] = useState('')
  const [folderError, setFolderError] = useState<string | null>(null)
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
  const libraryFoldersLoadedRef = useRef(false)
  const owner = settings.githubOwner?.trim()
  const {
    state,
    loadRepositories,
    refreshRepositories,
    loadMore,
  } = useOwnerRepositories(owner)
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
    const freshRepositories = await refreshRepositories()
    await refreshInstalledApps()

    if (!freshRepositories) return

    setLastRefreshedAt(new Date())
  }

  const handleCheckUpdates = useCallback(async () => {
    const freshInstalledApps = await refreshInstalledApps()
    await refreshLatestVersions(freshInstalledApps, state.repositories, true)
  }, [refreshInstalledApps, refreshLatestVersions, state.repositories])

  const handleInstalledFromRelease = async () => {
    if (selectedRepo) {
      const key = projectArtKey(selectedRepo.owner.login, selectedRepo.name)
      setRecentlyInstalledKey(key)
      setFeaturedRepo(selectedRepo)
      window.setTimeout(() => {
        setRecentlyInstalledKey((current) => current === key ? null : current)
      }, 6500)
    }
    await refreshInstalledApps()
  }

  const refreshLocalStatus = useCallback(async () => {
    await refreshInstalledApps()
  }, [refreshInstalledApps])

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
    setViewMode('home')
    setActiveFolderId(null)
  }

  useEffect(() => {
    let cancelled = false

    getLibraryFolders()
      .then((folders) => {
        if (cancelled) return
        libraryFoldersLoadedRef.current = true
        setLibraryFolders(ensureFavoritesFolder(folders))
      })
      .catch(() => {
        if (cancelled) return
        libraryFoldersLoadedRef.current = true
        setLibraryActionMessage(t('library.folder.saveError'))
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!libraryFoldersLoadedRef.current) return

    saveLibraryFolders(ensureFavoritesFolder(libraryFolders))
      .catch(() => setLibraryActionMessage(t('library.folder.saveError')))
  }, [libraryFolders, t])

  useEffect(() => {
    const favoriteRepoKeys = favorites
      .filter((favorite) => !isLauncherRepository(favorite.owner, favorite.repo))
      .map((favorite) => normalizeRepoKey(favorite.owner, favorite.repo))

    setLibraryFolders((current) => {
      const folders = ensureFavoritesFolder(current)
      const favoriteKeysSet = new Set(favoriteRepoKeys)
      const currentFavoriteFolder = folders[0]
      const nextFavoriteKeys = [
        ...currentFavoriteFolder.repoKeys.filter((key) => favoriteKeysSet.has(key)),
        ...favoriteRepoKeys,
      ]

      return [
        {
          ...currentFavoriteFolder,
          repoKeys: Array.from(new Set(nextFavoriteKeys)),
        },
        ...folders.slice(1),
      ]
    })
  }, [favorites])

  const openHomeView = () => {
    setViewMode('home')
    setActiveFolderId(null)
    setFilter('all')
    setSort('updated')
  }

  const openRecentView = () => {
    setViewMode('recent')
    setActiveFolderId(null)
    setFilter('all')
    setSort('updated')
  }

  const openReadyView = () => {
    setViewMode('ready')
    setActiveFolderId(null)
    setFilter('installed')
    setSort('status')
  }

  const openCreateFolderDialog = (repo: GitHubSearchResult) => {
    setFolderDialogRepo(repo)
    setFolderName('')
    setFolderError(null)
    setFolderDialogOpen(true)
  }

  const closeCreateFolderDialog = () => {
    setFolderDialogOpen(false)
    setFolderDialogRepo(null)
    setFolderName('')
    setFolderError(null)
  }

  const handleConfirmCreateFolder = () => {
    const name = normalizeFolderName(folderName)
    if (!name) {
      setFolderError(t('library.folder.emptyName'))
      return
    }

    const normalizedName = name.toLowerCase()
    const duplicate = displayFolders.some((folder) =>
      folder.name.toLowerCase() === normalizedName ||
      (folder.id === favoritesFolderId && t('library.folder.favorites').toLowerCase() === normalizedName)
    )
    if (duplicate) {
      setFolderError(t('library.folder.duplicateName'))
      return
    }

    const repoKey = folderDialogRepo
      ? normalizeRepoKey(folderDialogRepo.owner.login, folderDialogRepo.name)
      : null

    setLibraryFolders((current) => {
      const folders = ensureFavoritesFolder(current).map((folder) => {
        if (!repoKey || folder.id === favoritesFolderId) return folder
        return {
          ...folder,
          repoKeys: folder.repoKeys.filter((key) => key !== repoKey),
        }
      })

      return [
        ...folders,
        {
          id: makeFolderId(name),
          name,
          repoKeys: repoKey ? [repoKey] : [],
        },
      ]
    })
    closeCreateFolderDialog()
  }

  const handleMoveToFolder = async (repo: GitHubSearchResult, folderId: string) => {
    const repoKey = normalizeRepoKey(repo.owner.login, repo.name)

    if (folderId === favoritesFolderId && !favoriteKeys.has(repoKey)) {
      try {
        await addToFavorites(
          repo.owner.login,
          repo.name,
          repo.name,
          repo.description ?? undefined,
        )
        handleFavoriteChange(repo, true)
      } catch {
        // Browser preview fallback keeps the local folder move usable.
      }
    }

    setLibraryFolders((current) => ensureFavoritesFolder(current).map((folder) => {
      const keepFavoriteMembership = folder.id === favoritesFolderId && folder.id !== folderId
      const withoutCurrentRepo = keepFavoriteMembership
        ? folder.repoKeys
        : folder.repoKeys.filter((key) => key !== repoKey)
      if (folder.id !== folderId) {
        return {
          ...folder,
          repoKeys: withoutCurrentRepo,
        }
      }

      return {
        ...folder,
        repoKeys: [repoKey, ...withoutCurrentRepo],
      }
    }))
  }

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
  const libraryTrustKind: LibraryTrustKind = state.loading || checkingUpdates
    ? 'checking'
    : state.error
    ? libraryErrorKind === 'rateLimit'
      ? 'rateLimit'
      : libraryErrorKind === 'offline'
        ? 'offline'
        : 'cached'
    : installedLoadError || latestVersionErrorCount > 0
        ? 'partial'
        : 'fresh'

  useEffect(() => {
    if (settingsLoading || !owner) return
    void loadRepositories()
  }, [loadRepositories, owner, settingsLoading])

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
    const reposByKey = new Map(
      state.repositories
        .filter((repo) => !isLauncherRepository(repo.owner.login, repo.name))
        .map((repo) => [repoLookupKey(repo.owner.login, repo.name), repo]),
    )
    const favoritesByKey = new Map(
      favorites
        .filter((favorite) => !isLauncherRepository(favorite.owner, favorite.repo))
        .map((favorite) => [repoLookupKey(favorite.owner, favorite.repo), favorite]),
    )

    installedApps.forEach((app) => {
      if (isLauncherRepository(app.owner, app.repo)) return
      const key = repoLookupKey(app.owner, app.repo)
      if (!reposByKey.has(key)) {
        reposByKey.set(key, makeInstalledRepository(app, favoritesByKey.get(key)))
      }
    })

    favorites.forEach((favorite) => {
      if (isLauncherRepository(favorite.owner, favorite.repo)) return
      const key = repoLookupKey(favorite.owner, favorite.repo)
      if (!reposByKey.has(key)) {
        reposByKey.set(key, makeFavoriteRepository(favorite))
      }
    })

    return Array.from(reposByKey.values())
  }, [favorites, installedApps, state.repositories])

  const updateRepositories = useMemo(() => {
    return libraryRepositories.filter((repo) => {
      const installedApp = getInstalledApp(repo)
      const latestVersion = getLatestVersion(repo)
      if (!installedApp || !latestVersion || latestVersion === installedApp.activeVersion) return false
      return !dismissedUpdateKeys.has(updateDismissKey(repo, latestVersion))
    })
  }, [dismissedUpdateKeys, getInstalledApp, getLatestVersion, libraryRepositories])

  const displayFolders = useMemo(() => ensureFavoritesFolder(libraryFolders), [libraryFolders])
  const activeFolder = displayFolders.find((folder) => folder.id === activeFolderId) ?? null
  const activeFolderKeys = useMemo(() => {
    return new Set(activeFolder?.repoKeys ?? [])
  }, [activeFolder])
  const favoritesByRepoKey = useMemo(() => {
    return new Map(
      favorites
        .filter((favorite) => !isLauncherRepository(favorite.owner, favorite.repo))
        .map((favorite) => [normalizeRepoKey(favorite.owner, favorite.repo), favorite]),
    )
  }, [favorites])

  const visibleRepositories = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    const filtered = libraryRepositories.filter((repo) => {
      const installedApp = getInstalledApp(repo)
      const latestVersion = getLatestVersion(repo)
      const repoKey = normalizeRepoKey(repo.owner.login, repo.name)
      const isFavorite = favoriteKeys.has(repoKey)
      const hasUpdate = Boolean(
        installedApp &&
        latestVersion &&
        latestVersion !== installedApp.activeVersion,
      )
      const updateDismissed = Boolean(
        latestVersion && dismissedUpdateKeys.has(updateDismissKey(repo, latestVersion)),
      )

      if (activeFolder && !activeFolderKeys.has(repoKey)) return false
      if (viewMode === 'ready' && !installedApp) return false
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
      const repoActivityTimestamp = (repo: GitHubSearchResult) => {
        const repoKey = normalizeRepoKey(repo.owner.login, repo.name)
        const installedApp = getInstalledApp(repo)
        const favorite = favoritesByRepoKey.get(repoKey)
        return Math.max(
          new Date(repo.updated_at).getTime(),
          installedApp ? new Date(latestInstalledAt(installedApp)).getTime() : 0,
          favorite?.lastChecked ? new Date(favorite.lastChecked).getTime() : 0,
        )
      }

      if (viewMode === 'recent') {
        return repoActivityTimestamp(b) - repoActivityTimestamp(a) || a.name.localeCompare(b.name)
      }

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

      if (!activeFolder) {
        const favoriteRank = (repo: GitHubSearchResult) =>
          favoriteKeys.has(normalizeRepoKey(repo.owner.login, repo.name)) ? 0 : 1
        const favoriteDifference = favoriteRank(a) - favoriteRank(b)
        if (favoriteDifference !== 0) return favoriteDifference
      }

      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    })
  }, [
    activeFolder,
    activeFolderKeys,
    dismissedUpdateKeys,
    favoriteKeys,
    favoritesByRepoKey,
    filter,
    getInstalledApp,
    getLatestVersion,
    libraryRepositories,
    query,
    sort,
    viewMode,
  ])

  const visibleRepositorySections = useMemo<LibrarySection[]>(() => {
    if (visibleRepositories.length === 0) return []

    const reposByKey = new Map(
      visibleRepositories.map((repo) => [normalizeRepoKey(repo.owner.login, repo.name), repo]),
    )
    const assignedRepoKeys = new Set<string>()
    const folders = activeFolder ? [activeFolder] : displayFolders
    const sections: LibrarySection[] = []

    folders.forEach((folder) => {
      const repositories = folder.repoKeys
        .map((key) => reposByKey.get(key))
        .filter((repo): repo is GitHubSearchResult => Boolean(repo))

      if (repositories.length === 0) return

      repositories.forEach((repo) => {
        assignedRepoKeys.add(normalizeRepoKey(repo.owner.login, repo.name))
      })

      sections.push({
        id: folder.id,
        title: folder.id === favoritesFolderId ? t('library.folder.favorites') : folder.name,
        repositories,
        pinned: folder.pinned,
      })
    })

    if (!activeFolder) {
      const ungroupedRepositories = visibleRepositories.filter((repo) =>
        !assignedRepoKeys.has(normalizeRepoKey(repo.owner.login, repo.name))
      )

      if (ungroupedRepositories.length > 0) {
        sections.push({
          id: 'uncategorized',
          title: t('library.folder.uncategorized'),
          repositories: ungroupedRepositories,
        })
      }
    }

    return sections
  }, [activeFolder, displayFolders, t, visibleRepositories])

  const modeRepositoryCount = libraryRepositories.length

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
    const key = normalizeRepoKey(repo.owner.login, repo.name)
    setFavoriteKeys((current) => {
      const next = new Set(current)
      if (nextValue) {
        next.add(key)
      } else {
        next.delete(key)
      }
      return next
    })

    setLibraryFolders((current) => {
      const folders = ensureFavoritesFolder(current)
      return folders.map((folder) => {
        if (folder.id !== favoritesFolderId) return folder
        const repoKeys = nextValue
          ? [key, ...folder.repoKeys.filter((item) => item !== key)]
          : folder.repoKeys.filter((item) => item !== key)
        return {
          ...folder,
          repoKeys,
        }
      })
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
              onClick={handleCheckUpdates}
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
    if (suppressDiagnostics) return null

    const canRetry = !state.loading && !checkingUpdates
    const retryInstalled = Boolean(installedLoadError) && canRetry
    const shouldOfferRetry = Boolean(state.error)
    const shouldOfferUpdateCheck = latestVersionErrorCount > 0 || !latestVersionsCheckedAt
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
          {shouldOfferUpdateCheck && (
            <button
              type="button"
              className="secondary-btn"
              onClick={handleCheckUpdates}
              disabled={!canRetry}
            >
              {checkingUpdates ? t('library.refreshing') : t('updates.checkAll')}
            </button>
          )}
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

  const renderDetailsEmpty = () => {
    if (featuredRepo || filter === 'updates') return null

    return (
      <section className="library-details-empty" aria-label={t('library.detailsEmptyTitle')}>
        <div className="library-details-empty-mark" aria-hidden="true">i</div>
        <div>
          <h3>{t('library.detailsEmptyTitle')}</h3>
          <p>{t('library.detailsEmptyText')}</p>
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

  const missingOwner = !settingsLoading && !owner
  const showLoadingState = state.loading && libraryRepositories.length === 0
  const emptyTitleKey = modeRepositoryCount === 0
    ? `${pageKey}.emptyTitle`
    : `${pageKey}.noMatchesTitle`
  const emptyTextKey = modeRepositoryCount === 0
    ? `${pageKey}.emptyText`
    : `${pageKey}.noMatchesText`
  const emptyActionLabel = modeRepositoryCount === 0
    ? missingOwner && onOpenSettings
      ? t('library.openSettings')
      : t(`${pageKey}.refresh`)
    : t(`${pageKey}.resetFilters`)
  const emptyAction = modeRepositoryCount === 0
    ? missingOwner && onOpenSettings
      ? onOpenSettings
      : handleRefresh
    : handleResetLibraryFilters
  const normalizedFolderName = normalizeFolderName(folderName)
  const folderNameDuplicate = Boolean(normalizedFolderName) && displayFolders.some((folder) =>
    folder.name.toLowerCase() === normalizedFolderName.toLowerCase() ||
    (folder.id === favoritesFolderId &&
      t('library.folder.favorites').toLowerCase() === normalizedFolderName.toLowerCase())
  )
  const folderDialogError = folderError ||
    (folderNameDuplicate ? t('library.folder.duplicateName') : null)
  const canCreateFolder = Boolean(normalizedFolderName) && !folderNameDuplicate

  return (
    <div className="page library-page">
      <div className="library-sam-workspace">
          <section className="library-sam-list-pane" aria-label={t(`${pageKey}.title`)}>
            <section className="library-toolstrip" aria-label={t(`${pageKey}.filterLabel`)}>
              <div className="library-sidebar-nav" aria-label={t('library.sidebar.navigation')}>
                <button
                  type="button"
                  className={`library-sidebar-nav-btn library-sidebar-nav-home ${viewMode === 'home' && !activeFolder ? 'active' : ''}`}
                  aria-pressed={viewMode === 'home' && !activeFolder}
                  onClick={openHomeView}
                >
                  {t('library.nav.home')}
                </button>
                <button
                  type="button"
                  className={`library-sidebar-nav-btn library-sidebar-nav-icon ${viewMode === 'recent' ? 'active' : ''}`}
                  aria-label={t('library.nav.recent')}
                  title={t('library.nav.recent')}
                  aria-pressed={viewMode === 'recent'}
                  onClick={openRecentView}
                >
                  <span aria-hidden="true">◷</span>
                </button>
                <button
                  type="button"
                  className={`library-sidebar-nav-btn library-sidebar-nav-icon ${viewMode === 'ready' ? 'active' : ''}`}
                  aria-label={t('library.nav.ready')}
                  title={t('library.nav.ready')}
                  aria-pressed={viewMode === 'ready'}
                  onClick={openReadyView}
                >
                  <span aria-hidden="true">▶</span>
                </button>
              </div>

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

            </section>

            <div className="search-results">
              {state.error && !state.isStale && !suppressDiagnostics && (
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

              {installedLoadError && !suppressDiagnostics && (
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

              {visibleRepositorySections.map((section) => (
                <section key={section.id} className={`library-folder-section ${section.pinned ? 'pinned' : ''}`}>
                  <div className="library-folder-section-header">
                    <span>{section.title}</span>
                    <em>{t('library.folder.itemsCount', { count: section.repositories.length })}</em>
                  </div>
                  <div className="library-folder-section-items">
                    {section.repositories.map((repo) => {
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
                          onUninstall={() => handleRequestUninstall(repo)}
                          onInstall={() => setSelectedRepo(repo)}
                          onLaunch={() => handleLaunch(repo)}
                          folders={displayFolders.map((folder) => ({
                            id: folder.id,
                            name: folder.id === favoritesFolderId ? t('library.folder.favorites') : folder.name,
                          }))}
                          onCreateFolder={() => openCreateFolderDialog(repo)}
                          onMoveToFolder={(folderId) => handleMoveToFolder(repo, folderId)}
                        />
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>

            {state.hasMore && (
              <button type="button" onClick={loadMore} className="load-more-btn" disabled={state.loading}>
                {state.loading ? t('library.loadingMore') : t('library.loadMore')}
              </button>
            )}
          </section>

          <aside className="library-sam-details-pane" aria-label={featuredRepo?.name ?? t('details.open')}>
            <div className="library-sam-details-toolbar">
              <span>{t('details.open')}</span>
            </div>
            {renderLibraryTrustPanel()}
            {renderDetailsEmpty()}
            {renderHero()}
            {renderOperationsPanel()}
            {renderUpdatesCenter()}
          </aside>
        </div>

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

      {folderDialogOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeCreateFolderDialog}>
          <div
            className="confirm-modal library-folder-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="library-folder-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="confirm-modal-header">
              <div>
                <span className="confirm-modal-kicker">{t('library.folder.title')}</span>
                <h3 id="library-folder-modal-title">{t('library.folder.modalTitle')}</h3>
              </div>
              <button
                type="button"
                className="secondary-btn confirm-close-btn"
                aria-label={t('library.folder.cancel')}
                onClick={closeCreateFolderDialog}
              >
                ×
              </button>
            </div>
            <div className="library-folder-form">
              <label htmlFor="library-folder-name">{t('library.folder.nameLabel')}</label>
              <input
                id="library-folder-name"
                type="text"
                value={folderName}
                placeholder={t('library.folder.namePlaceholder')}
                autoFocus
                onChange={(event) => {
                  setFolderName(event.target.value)
                  setFolderError(null)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && canCreateFolder) {
                    handleConfirmCreateFolder()
                  }
                }}
              />
              {folderDialogRepo && (
                <p>{t('library.folder.targetApp', { name: folderDialogRepo.name })}</p>
              )}
              {folderDialogError && (
                <span className="library-folder-error" role="alert">{folderDialogError}</span>
              )}
            </div>
            <div className="confirm-actions">
              <button type="button" className="secondary-btn" onClick={closeCreateFolderDialog}>
                {t('library.folder.cancel')}
              </button>
              <button type="button" onClick={handleConfirmCreateFolder} disabled={!canCreateFolder}>
                {t('library.folder.confirm')}
              </button>
            </div>
          </div>
        </div>
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
