import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { listen } from '@tauri-apps/api/event'
import { getLocalizedErrorMessage } from '../../services/tauri'
import { useOwnerRepositories } from './hooks/useGitHub'
import { useSettings } from '../../hooks/useSettings'
import { useLibraryStatus } from './hooks/useLibraryStatus'
import { useLibrarySelection } from './hooks/useLibrarySelection'
import { useLibraryFiltering } from './hooks/useLibraryFiltering'
import { useBatchUpdates } from './hooks/useBatchUpdates'
import { useLibraryBulkSelection } from './hooks/useLibraryBulkSelection'
import RepoCard from './components/RepoCard'
import LibrarySidebar, { type LibrarySection } from './components/LibrarySidebar'
import type { BatchUpdateItem } from './components/BatchUpdatePanel'
import StatePanel from '../../components/State/StatePanel'
import { launchApp, openInstalledAppDir, uninstallApp, uninstallVersion, adoptInstalledApp } from '../../services/installed'
import { addToFavorites, getFavorites, removeFromFavorites } from '../../services/favorites'
import { getLibraryFolders, saveLibraryFolders } from '../../services/libraryFolders'
import { clearGithubCache } from '../../services/github'
import { openWebsiteUrl } from '../../services/updates'
import { getDefaultProjectScreenshots, listDefaultProjectIcons } from '../../services/defaultMedia'
import { pickImageFile } from '../../services/dialog'
import {
  clearProjectArt,
  listProjectArt,
  projectArtCoverUrl,
  projectArtCoverCropStyle,
  projectArtBackgroundUrl,
  projectArtCropStyle,
  projectArtKey,
  setProjectArt,
  setProjectArtCrop,
} from '../../services/projectArt'
import type { ArtCrop, FavoriteApp, GitHubSearchResult, InstalledApp, LibraryFolder, ProjectArt, DetectedInstallation } from '../../types'
import { useI18n } from '../../i18n'
import { getLibraryAppStatus, getUpdateDismissKey } from './libraryStatus'
import { useToastPresence } from '../../hooks/useToastPresence'
import { getInactiveInstalledVersions, runSequentialBulk } from './libraryBulkOperations'
import {
  loadLibraryViewState,
  saveLibraryViewState,
  type LibraryViewState,
} from './libraryViewState'
import type { LibraryDensity, LibraryViewMode } from './libraryViewControls'
import { CloseIcon } from '../../components/ui/Icons'
import { currentStage } from '../../utils/downloadProgress'
import '../../pages/PageStyles.css'
import './LibraryCatalog.css'

type LibraryErrorKind = 'rateLimit' | 'offline' | 'notFound' | 'generic'
type LibraryTrustKind = 'fresh' | 'checking' | 'cached' | 'rateLimit' | 'offline' | 'partial'
type UninstallTarget = {
  repo: GitHubSearchResult
  installedApp: InstalledApp
}

const repoLookupKey = projectArtKey
const LibraryHero = lazy(() => import('./components/LibraryHero'))
const LibraryOperationsPanel = lazy(() => import('./components/LibraryOperationsPanel'))
const ProjectGallery = lazy(() => import('./components/ProjectGallery'))
const BatchUpdatePanel = lazy(() => import('./components/BatchUpdatePanel'))
const CATALOG_OWNER = 'CpPrice11'

function isLauncherRepository(owner: string, repo: string) {
  return owner.trim().toLowerCase() === 'cpprice11' &&
    ['pullora', 'pullora-assets'].includes(repo.trim().toLowerCase())
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
    website_url: favorite?.websiteUrl,
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
    website_url: favorite.websiteUrl,
    language: null,
    topics: null,
    has_releases: true,
    fork: false,
    archived: false,
    private: false,
  }
}

const favoritesFolderId = 'favorites'
const uncategorizedFolderId = 'uncategorized'
const collapsedFoldersStorageKey = 'pullora-library-collapsed-folders-v1'
const dismissedUpdatesStorageKey = 'pullora-dismissed-update-versions-v1'

const normalizeRepoKey = projectArtKey

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

function cleanLibraryFolders(folders: LibraryFolder[]) {
  return ensureFavoritesFolder(folders).filter((folder) =>
    folder.id === favoritesFolderId || folder.repoKeys.length > 0
  )
}

function makeFolderId(name: string) {
  return `folder-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'custom'}-${Date.now()}`
}

function loadCollapsedFolderIds() {
  if (typeof window === 'undefined') return new Set<string>()

  try {
    const rawIds = window.localStorage.getItem(collapsedFoldersStorageKey)
    if (!rawIds) return new Set<string>()
    const parsed = JSON.parse(rawIds) as unknown
    if (!Array.isArray(parsed)) return new Set<string>()
    return new Set(parsed.filter((id): id is string => typeof id === 'string'))
  } catch {
    return new Set<string>()
  }
}

function loadDismissedUpdateKeys() {
  if (typeof window === 'undefined') return new Set<string>()

  try {
    const parsed = JSON.parse(window.localStorage.getItem(dismissedUpdatesStorageKey) ?? '[]') as unknown
    if (!Array.isArray(parsed)) return new Set<string>()
    return new Set(parsed.filter((key): key is string => typeof key === 'string').slice(-500))
  } catch {
    return new Set<string>()
  }
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

interface LibraryPageProps {
  onOpenSettings?: () => void
  suppressDiagnostics?: boolean
}

const ReleaseSelector = lazy(() => import('../../components/Install/ReleaseSelector'))
const DownloadProgressPanel = lazy(() => import('../../components/Install/DownloadProgress'))
const ArtCropDialog = lazy(() => import('../../components/Modal/ArtCropDialog'))
const LibraryBulkActions = lazy(() => import('./components/LibraryBulkActions').then((module) => ({
  default: module.LibraryBulkActions,
})))
const LibraryBulkConfirmDialog = lazy(() => import('./components/LibraryBulkActions').then((module) => ({
  default: module.LibraryBulkConfirmDialog,
})))
const FolderManager = lazy(() => import('./components/FolderManager'))
const UninstallConfirmModal = lazy(() => import('./components/UninstallConfirmModal'))

function LibraryPage({
  onOpenSettings,
  suppressDiagnostics = false,
}: LibraryPageProps) {
  const { language, t } = useI18n()
  const pageKey = 'library'
  const [initialLibraryView] = useState(loadLibraryViewState)
  const [libraryViewMode, setLibraryViewMode] = useState<LibraryViewMode>(initialLibraryView.viewMode)
  const [libraryFolders, setLibraryFolders] = useState<LibraryFolder[]>(() => ensureFavoritesFolder([]))
  const [folderDialogRepo, setFolderDialogRepo] = useState<GitHubSearchResult | null>(null)
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<Set<string>>(() => loadCollapsedFolderIds())
  const [recentlyInstalledKey, setRecentlyInstalledKey] = useState<string | null>(null)
  const [projectArt, setProjectArtState] = useState<Record<string, ProjectArt>>({})
  const [defaultIcons, setDefaultIcons] = useState<Record<string, string>>({})
  const [defaultScreenshots, setDefaultScreenshots] = useState<{ key: string; urls: string[] } | null>(null)
  const [favoriteKeys, setFavoriteKeys] = useState<Set<string>>(new Set())
  const [favorites, setFavorites] = useState<FavoriteApp[]>([])
  const [favoriteBusy, setFavoriteBusy] = useState(false)
  const [pendingArtCrop, setPendingArtCrop] = useState<{
    repo: GitHubSearchResult
    sourcePath: string
    kind: 'cover' | 'background'
    mode: 'replace' | 'edit'
    initialCrop?: ArtCrop
    previewShape?: 'hero' | 'card' | 'row'
    previewAspectRatios?: Partial<Record<LibraryDensity, number>>
  } | null>(null)
  const [launchError, setLaunchError] = useState<string | null>(null)
  const [dismissedUpdateKeys, setDismissedUpdateKeys] = useState<Set<string>>(
    loadDismissedUpdateKeys,
  )
  const [uninstallTarget, setUninstallTarget] = useState<UninstallTarget | null>(null)
  const [uninstallBusy, setUninstallBusy] = useState(false)
  const [uninstallError, setUninstallError] = useState<string | null>(null)
  const [libraryActionMessage, setLibraryActionMessage] = useState<string | null>(null)
  const [libraryActionError, setLibraryActionError] = useState<string | null>(null)
  const [manualUpdateRepo, setManualUpdateRepo] = useState<GitHubSearchResult | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkMessage, setBulkMessage] = useState<string | null>(null)
  const [bulkError, setBulkError] = useState<string | null>(null)
  const [bulkConfirm, setBulkConfirm] = useState<'cleanup' | 'uninstall' | null>(null)
  const [refreshingLibrary, setRefreshingLibrary] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [releasePickerStartsAtFile, setReleasePickerStartsAtFile] = useState(false)
  const [adoptingKey, setAdoptingKey] = useState<string | null>(null)
  const detailsReturnFocus = useRef<HTMLElement | null>(null)
  const closeDetails = () => {
    setDetailsOpen(false)
    detailsReturnFocus.current?.focus()
  }
  const { settings, loading: settingsLoading } = useSettings()
  const libraryFoldersLoadedRef = useRef(false)
  const owner = CATALOG_OWNER
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
    getReleaseDate,
    refreshInstalledApps,
    refreshLatestVersions,
    discoveredApps, discoveryError, refreshDiscovered, healthByRepo,
    runtimeByRepo, runtimeError, refreshRuntime,
  } = useLibraryStatus(state.repositories)

  const handleRefresh = async () => {
    if (refreshingLibrary) return

    setRefreshingLibrary(true)
    setLibraryActionMessage(null)
    setLibraryActionError(null)
    try {
      await clearGithubCache()
      const [freshRepositories, freshInstalledApps] = await Promise.all([
        refreshRepositories(),
        refreshInstalledApps(),
        listDefaultProjectIcons(true).then(setDefaultIcons).catch(() => {}),
        refreshDiscovered(),
        refreshRuntime(),
      ])
      await refreshLatestVersions(
        freshInstalledApps,
        freshRepositories ?? state.repositories,
        true,
      )
      if (freshRepositories) setLibraryActionMessage(t('library.refreshDone'))
    } catch (err) {
      setLibraryActionError(err instanceof Error ? err.message : t('refresh.error'))
    } finally {
      setRefreshingLibrary(false)
    }
  }

  const handleCheckUpdates = useCallback(async () => {
    const freshInstalledApps = await refreshInstalledApps()
    await refreshLatestVersions(freshInstalledApps, state.repositories, true)
  }, [refreshInstalledApps, refreshLatestVersions, state.repositories])

  const handleInstalledFromRelease = async () => {
    if (selectedRepo) {
      const key = projectArtKey(selectedRepo.owner.login, selectedRepo.name)
      setRecentlyInstalledKey(key)
      selectFeaturedRepo(selectedRepo)
      window.setTimeout(() => {
        setRecentlyInstalledKey((current) => current === key ? null : current)
      }, 6500)
    }
    await refreshInstalledApps()
  }

  const refreshLocalStatus = useCallback(async () => {
    await Promise.all([refreshInstalledApps(), refreshDiscovered(), refreshRuntime()])
  }, [refreshInstalledApps, refreshDiscovered, refreshRuntime])

  const handleRequestUninstall = (repo: GitHubSearchResult) => {
    const installedApp = getInstalledApp(repo)
    if (!installedApp) return

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
      next.add(getUpdateDismissKey(repo.owner.login, repo.name, latestVersion))
      return next
    })
  }

  const handleClearSkippedUpdates = () => {
    setDismissedUpdateKeys(new Set())
  }

  useEffect(() => {
    let cancelled = false

    getLibraryFolders()
      .then((folders) => {
        if (cancelled) return
        libraryFoldersLoadedRef.current = true
        setLibraryFolders(cleanLibraryFolders(folders))
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

    saveLibraryFolders(cleanLibraryFolders(libraryFolders))
      .catch(() => setLibraryActionMessage(t('library.folder.saveError')))
  }, [libraryFolders, t])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(
      collapsedFoldersStorageKey,
      JSON.stringify(Array.from(collapsedFolderIds)),
    )
  }, [collapsedFolderIds])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(
        dismissedUpdatesStorageKey,
        JSON.stringify(Array.from(dismissedUpdateKeys)),
      )
    } catch {
      // Пропуск у поточному сеансі працює навіть без доступу до сховища.
    }
  }, [dismissedUpdateKeys])

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

      return cleanLibraryFolders([
        {
          ...currentFavoriteFolder,
          repoKeys: Array.from(new Set(nextFavoriteKeys)),
        },
        ...folders.slice(1),
      ])
    })
  }, [favorites])

  const openCreateFolderDialog = (repo: GitHubSearchResult) => {
    setFolderDialogRepo(repo)
  }

  const closeCreateFolderDialog = () => {
    setFolderDialogRepo(null)
  }

  const toggleFolderSection = (sectionId: string) => {
    setCollapsedFolderIds((current) => {
      const next = new Set(current)
      if (next.has(sectionId)) {
        next.delete(sectionId)
      } else {
        next.add(sectionId)
      }
      return next
    })
  }

  const handleConfirmCreateFolder = (name: string) => {
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

      return cleanLibraryFolders([
        ...folders,
        {
          id: makeFolderId(name),
          name,
          repoKeys: repoKey ? [repoKey] : [],
        },
      ])
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

    setLibraryFolders((current) => cleanLibraryFolders(ensureFavoritesFolder(current).map((folder) => {
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
    })))
  }

  const handleRemoveFromFolder = async (repo: GitHubSearchResult, folderId: string) => {
    const repoKey = normalizeRepoKey(repo.owner.login, repo.name)

    if (folderId === favoritesFolderId) {
      try {
        await removeFromFavorites(repo.owner.login, repo.name)
      } catch {
        // Browser preview fallback keeps the local folder update usable.
      }
      handleFavoriteChange(repo, false)
      return
    }

    setLibraryFolders((current) => cleanLibraryFolders(ensureFavoritesFolder(current).map((folder) => {
      if (folder.id !== folderId) return folder
      return {
        ...folder,
        repoKeys: folder.repoKeys.filter((key) => key !== repoKey),
      }
    })))
  }

  const handleMoveToUncategorized = async (repo: GitHubSearchResult) => {
    const repoKey = normalizeRepoKey(repo.owner.login, repo.name)

    if (favoriteKeys.has(repoKey)) {
      try {
        await removeFromFavorites(repo.owner.login, repo.name)
      } catch {
        // Browser preview fallback keeps the local folder update usable.
      }
      handleFavoriteChange(repo, false)
    }

    setLibraryFolders((current) => cleanLibraryFolders(ensureFavoritesFolder(current).map((folder) => ({
      ...folder,
      repoKeys: folder.repoKeys.filter((key) => key !== repoKey),
    }))))
  }

  const formatTime = (date: Date | null) => date
    ? date.toLocaleTimeString(language === 'en' ? 'en-US' : 'uk-UA', {
      hour: '2-digit',
      minute: '2-digit',
    })
    : null
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
    let cancelled = false
    listDefaultProjectIcons().then((icons) => { if (!cancelled) setDefaultIcons(icons) }).catch(() => {})
    return () => { cancelled = true }
  }, [])

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
    if (!libraryActionMessage && !libraryActionError) return
    const timer = window.setTimeout(() => {
      setLibraryActionMessage(null)
      setLibraryActionError(null)
    }, 4200)
    return () => window.clearTimeout(timer)
  }, [libraryActionError, libraryActionMessage])

  const handleInstallError = useCallback((message: string) => {
    setLibraryActionMessage(null)
    setLibraryActionError(message)
  }, [])

  useEffect(() => {
    let active = true
    let cleanup: (() => void) | undefined
    void listen<string>('tray-action-error', ({ payload }) => {
      handleInstallError(getLocalizedErrorMessage(payload))
    }).then((unlisten) => {
      if (active) cleanup = unlisten
      else unlisten()
    }).catch(() => {})
    return () => { active = false; cleanup?.() }
  }, [handleInstallError])

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
      if (getLibraryAppStatus(installedApp, latestVersion) !== 'update' || !latestVersion) return false
      return !dismissedUpdateKeys.has(
        getUpdateDismissKey(repo.owner.login, repo.name, latestVersion),
      )
    })
  }, [dismissedUpdateKeys, getInstalledApp, getLatestVersion, libraryRepositories])

  const {
    batchDownloads,
    installingKeys,
    startAutomaticInstall,
    cancelBatchDownload,
    setBatchDownloadPaused,
    batchUpdating,
    batchUpdateMessage,
    batchUpdateError,
    batchCleanupMessage,
    handleUpdateAllPortable,
    handleBatchRetry,
    handleBatchOpenFolder,
    handleBatchCleanup,
  } = useBatchUpdates({
    repositories: updateRepositories,
    getLatestVersion,
    refreshLocalStatus,
  })

  const handleAutomaticUpdates = async (
    repositories: GitHubSearchResult[] = updateRepositories,
  ) => {
    setManualUpdateRepo(null)
    const result = await handleUpdateAllPortable(repositories)
    const skippedKeys = new Set(result.skippedKeys)
    setManualUpdateRepo(repositories.find((repo) => skippedKeys.has(
      normalizeRepoKey(repo.owner.login, repo.name),
    )) ?? null)
    return result
  }

  const activeDismissedUpdateCount = useMemo(() => libraryRepositories.reduce((count, repo) => {
    const latestVersion = getLatestVersion(repo)
    return latestVersion && dismissedUpdateKeys.has(
      getUpdateDismissKey(repo.owner.login, repo.name, latestVersion),
    )
      ? count + 1
      : count
  }, 0), [dismissedUpdateKeys, getLatestVersion, libraryRepositories])

  const displayFolders = useMemo(() => cleanLibraryFolders(libraryFolders), [libraryFolders])
  const {
    query,
    setQuery,
    filter,
    sort,
    visibleRepositories,
    resetFilters: handleResetLibraryFilters,
    changeFilter: handleFilterChange,
    changeSort: handleSortChange,
  } = useLibraryFiltering({
    repositories: libraryRepositories,
    dismissedUpdateKeys,
    getInstalledApp,
    getLatestVersion,
    initialQuery: initialLibraryView.query,
    initialFilter: initialLibraryView.filter,
    initialSort: initialLibraryView.sort,
  })

  const {
    selectedRepo,
    setSelectedRepo,
    featuredRepo,
    heroPanel,
    setHeroPanel,
    selectFeaturedRepo,
  } = useLibrarySelection(visibleRepositories, initialLibraryView.featuredRepoKey)

  const handleQuickInstall = async (repo: GitHubSearchResult, preferExistingInstall = false) => {
    setLibraryActionError(null)
    setLibraryActionMessage(null)
    try {
      if (repo.website_url) {
        await openWebsiteUrl(repo.website_url)
        return
      }
      if (await startAutomaticInstall(repo, preferExistingInstall) === 'choose') {
        setReleasePickerStartsAtFile(true)
        setSelectedRepo(repo)
      }
    } catch (error) {
      handleInstallError(error instanceof Error ? error.message : t('errors.commandFailed'))
    }
  }

  const handleAdopt = async (candidate: DetectedInstallation) => {
    if (adoptingKey) return
    setAdoptingKey(projectArtKey(candidate.owner, candidate.repo))
    setLibraryActionError(null)
    try {
      await adoptInstalledApp(candidate)
      await refreshLocalStatus()
    } catch (error) { handleInstallError(error instanceof Error ? error.message : t('errors.discoveryFailed')) }
    finally { setAdoptingKey(null) }
  }

  const sidebarResultsRef = useRef<HTMLDivElement>(null)
  const detailsPaneRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!detailsOpen) return
    detailsPaneRef.current?.focus({ preventScroll: true })
    detailsPaneRef.current?.scrollIntoView({ block: 'start' })
  }, [detailsOpen, featuredRepo?.id])
  const sidebarScrollTopRef = useRef(initialLibraryView.sidebarScrollTop)
  const detailsScrollTopRef = useRef(
    initialLibraryView.filter === 'updates' ? 0 : initialLibraryView.detailsScrollTop,
  )
  const lastFeaturedRepoKeyRef = useRef(initialLibraryView.featuredRepoKey)
  const viewPersistenceTimerRef = useRef<number | null>(null)
  const scrollRestoredRef = useRef(false)
  const featuredRepoKey = featuredRepo
    ? projectArtKey(featuredRepo.owner.login, featuredRepo.name)
    : null

  useEffect(() => {
    let cancelled = false
    if (detailsOpen && featuredRepoKey) {
      getDefaultProjectScreenshots(featuredRepoKey)
        .then((urls) => { if (!cancelled) setDefaultScreenshots({ key: featuredRepoKey, urls }) })
        .catch(() => {})
    }
    return () => { cancelled = true }
  }, [detailsOpen, featuredRepoKey, defaultIcons])
  const libraryViewSnapshotRef = useRef<LibraryViewState>(initialLibraryView)

  if (featuredRepoKey) lastFeaturedRepoKeyRef.current = featuredRepoKey
  libraryViewSnapshotRef.current = {
    version: 1,
    query,
    filter,
    sort,
    density: initialLibraryView.density,
    viewMode: libraryViewMode,
    featuredRepoKey: lastFeaturedRepoKeyRef.current,
    sidebarScrollTop: sidebarScrollTopRef.current,
    detailsScrollTop: detailsScrollTopRef.current,
  }

  const persistLibraryView = useCallback(() => {
    saveLibraryViewState({
      ...libraryViewSnapshotRef.current,
      sidebarScrollTop: sidebarScrollTopRef.current,
      detailsScrollTop: detailsScrollTopRef.current,
    })
  }, [])

  const scheduleLibraryViewPersistence = useCallback(() => {
    if (viewPersistenceTimerRef.current !== null) {
      window.clearTimeout(viewPersistenceTimerRef.current)
    }
    viewPersistenceTimerRef.current = window.setTimeout(() => {
      viewPersistenceTimerRef.current = null
      persistLibraryView()
    }, 150)
  }, [persistLibraryView])

  useEffect(() => {
    scheduleLibraryViewPersistence()
  }, [featuredRepoKey, filter, libraryViewMode, query, scheduleLibraryViewPersistence, sort])

  useEffect(() => {
    const dataReady = !settingsLoading && !state.loading && (
      Boolean(state.lastLoadedAt) || Boolean(state.error) || !owner
    )
    if (
      scrollRestoredRef.current ||
      !dataReady ||
      (visibleRepositories.length > 0 && !featuredRepo)
    ) return

    scrollRestoredRef.current = true
    const frame = window.requestAnimationFrame(() => {
      if (sidebarResultsRef.current) {
        sidebarResultsRef.current.scrollTop = initialLibraryView.sidebarScrollTop
      }
      if (detailsPaneRef.current) {
        detailsPaneRef.current.scrollTop = detailsScrollTopRef.current
      }
    })
    return () => window.cancelAnimationFrame(frame)
  }, [featuredRepo, initialLibraryView, owner, settingsLoading, state.error, state.lastLoadedAt, state.loading, visibleRepositories.length])

  useEffect(() => () => {
    if (viewPersistenceTimerRef.current !== null) {
      window.clearTimeout(viewPersistenceTimerRef.current)
    }
    persistLibraryView()
  }, [persistLibraryView])

  const visibleRepositorySections = useMemo<LibrarySection[]>(() => {
    if (visibleRepositories.length === 0) return []

    const reposByKey = new Map(
      visibleRepositories.map((repo) => [normalizeRepoKey(repo.owner.login, repo.name), repo]),
    )
    const assignedRepoKeys = new Set<string>()
    const folders = displayFolders
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

    const ungroupedRepositories = visibleRepositories.filter((repo) =>
      !assignedRepoKeys.has(normalizeRepoKey(repo.owner.login, repo.name))
    )

    if (ungroupedRepositories.length > 0) {
      sections.push({
        id: uncategorizedFolderId,
        title: t('library.folder.uncategorized'),
        repositories: ungroupedRepositories,
      })
    }

    return sections
  }, [displayFolders, t, visibleRepositories])

  const orderedVisibleRepositories = useMemo(() => {
    const seen = new Set<string>()
    return visibleRepositorySections.flatMap((section) => section.repositories).filter((repo) => {
      const key = normalizeRepoKey(repo.owner.login, repo.name)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [visibleRepositorySections])
  const orderedVisibleKeys = useMemo(
    () => orderedVisibleRepositories.filter((repo) => !repo.website_url).map((repo) => normalizeRepoKey(repo.owner.login, repo.name)),
    [orderedVisibleRepositories],
  )
  const bulkSelection = useLibraryBulkSelection(orderedVisibleKeys)
  const bulkSelectedRepositories = useMemo(
    () => libraryRepositories.filter((repo) => !repo.website_url &&
      bulkSelection.selectedKeys.has(normalizeRepoKey(repo.owner.login, repo.name)),
    ),
    [bulkSelection.selectedKeys, libraryRepositories],
  )
  const bulkInstalledApps = useMemo(() => bulkSelectedRepositories.flatMap((repo) => {
    const installedApp = getInstalledApp(repo)
    return installedApp ? [installedApp] : []
  }), [bulkSelectedRepositories, getInstalledApp])
  const bulkUpdateRepositories = useMemo(() => bulkSelectedRepositories.filter((repo) => {
    const latestVersion = getLatestVersion(repo)
    return Boolean(latestVersion) && getLibraryAppStatus(getInstalledApp(repo), latestVersion) === 'update'
  }), [bulkSelectedRepositories, getInstalledApp, getLatestVersion])
  const bulkInactiveVersions = useMemo(
    () => getInactiveInstalledVersions(bulkInstalledApps),
    [bulkInstalledApps],
  )
  const bulkUninstallSize = useMemo(() => bulkInstalledApps.reduce(
    (sum, app) => sum + app.versions.reduce((appSum, version) => appSum + version.sizeBytes, 0),
    0,
  ), [bulkInstalledApps])
  const bulkCleanupSize = useMemo(() => bulkInactiveVersions.reduce(
    (sum, item) => sum + item.version.sizeBytes,
    0,
  ), [bulkInactiveVersions])

  const modeRepositoryCount = libraryRepositories.length

  const featuredArt = featuredRepo
    ? projectArt[projectArtKey(featuredRepo.owner.login, featuredRepo.name)]
    : undefined
  const featuredCover = projectArtCoverUrl(featuredArt) ?? (featuredRepoKey ? defaultIcons[featuredRepoKey] : null)
  const featuredCoverStyle = projectArtCoverUrl(featuredArt) ? projectArtCoverCropStyle(featuredArt) : { objectFit: 'contain' as const }
  const featuredBackground = projectArtBackgroundUrl(featuredArt, { fallbackToCover: false })
  const featuredBackgroundStyle = featuredBackground
    ? projectArtCropStyle(featuredArt)
    : undefined

  const handleLaunch = async (repo: GitHubSearchResult) => {
    setLaunchError(null)
    try {
      await launchApp(repo.owner.login, repo.name)
      await refreshInstalledApps()
      await refreshRuntime()
    } catch (err) {
      setLaunchError(err instanceof Error ? err.message : t('library.launchError'))
    }
  }

  const handlePickArt = async (kind: 'cover' | 'background', targetRepo = featuredRepo, previewShape: 'hero' | 'card' | 'row' = 'hero', target?: HTMLElement | null) => {
    if (!targetRepo) return

    const previewAspectRatios = kind === 'background' ? getArtAspectRatios(previewShape, target) : undefined

    setLibraryActionError(null)
    const imagePath = await pickImageFile()
    if (!imagePath) return

    setPendingArtCrop({
      repo: targetRepo,
      sourcePath: imagePath,
      kind,
      mode: 'replace',
      previewShape,
      previewAspectRatios,
    })
  }

  const getArtAspectRatios = (previewShape: 'hero' | 'card' | 'row', target?: HTMLElement | null) => {
    const surface = previewShape === 'hero' ? document.querySelector('.library-page .library-hero') : target
    if (!surface) return undefined

    const bounds = surface.getBoundingClientRect()
    if (!bounds.width || !bounds.height) return undefined

    return { normal: bounds.width / bounds.height }
  }

  const handleEditArt = (kind: 'cover' | 'background', targetRepo = featuredRepo, previewShape: 'hero' | 'card' | 'row' = 'hero', target?: HTMLElement | null) => {
    if (!targetRepo) return
    const art = projectArt[projectArtKey(targetRepo.owner.login, targetRepo.name)]
    const sourcePath = kind === 'cover' ? art?.coverPath : art?.backgroundPath
    if (!sourcePath) return
    const previewAspectRatios = kind === 'background' ? getArtAspectRatios(previewShape, target) : undefined

    setLibraryActionError(null)
    setPendingArtCrop({
      repo: targetRepo,
      sourcePath,
      kind,
      mode: 'edit',
      initialCrop: kind === 'cover' ? art.coverCrop : art.backgroundCrop,
      previewShape,
      previewAspectRatios,
    })
  }

  const handleSaveArtCrop = async (crop: ArtCrop) => {
    if (!pendingArtCrop) return
    const { repo, sourcePath, kind, mode } = pendingArtCrop

    try {
      const updatedArt = mode === 'replace'
        ? await setProjectArt(repo.owner.login, repo.name, kind, sourcePath, crop)
        : await setProjectArtCrop(repo.owner.login, repo.name, kind, crop)
      setProjectArtState((current) => ({
        ...current,
        [projectArtKey(repo.owner.login, repo.name)]: updatedArt,
      }))
      setPendingArtCrop(null)
    } catch (error) {
      setLibraryActionError(t('art.saveError'))
      throw error
    }
  }

  const handleClearArt = async (targetRepo = featuredRepo, kind: 'cover' | 'background' = 'cover') => {
    if (!targetRepo) return

    setLibraryActionError(null)
    try {
      const updatedArt = await clearProjectArt(
        targetRepo.owner.login,
        targetRepo.name,
        kind,
      )
      setProjectArtState((current) => ({
        ...current,
        [projectArtKey(targetRepo.owner.login, targetRepo.name)]: updatedArt,
      }))
    } catch {
      setLibraryActionError(t('art.clearError'))
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

  const handleOpenFolder = async (repo: GitHubSearchResult) => {
    setLaunchError(null)
    try {
      await openInstalledAppDir(repo.owner.login, repo.name)
    } catch (err) {
      setLaunchError(err instanceof Error ? err.message : t('installed.openFolderError'))
    }
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
      setLibraryActionError(t('art.saveError'))
    } finally {
      setFavoriteBusy(false)
    }
  }

  const showBulkResult = (success: number, skipped: number, failed: number) => {
    const message = t('library.bulk.result', { success, skipped, failed })
    setBulkMessage(message)
    setBulkError(failed > 0 ? t('library.bulk.retryFailed', { count: failed }) : null)
    setLibraryActionMessage(message)
  }

  const handleBulkUpdate = async () => {
    setBulkBusy(true)
    setBulkError(null)
    try {
      const result = await handleAutomaticUpdates(bulkUpdateRepositories)
      const eligibleKeys = new Set(bulkUpdateRepositories.map((repo) =>
        normalizeRepoKey(repo.owner.login, repo.name),
      ))
      const unavailableKeys = [...bulkSelection.selectedKeys].filter((key) => !eligibleKeys.has(key))
      bulkSelection.remove([...result.startedKeys, ...result.skippedKeys, ...unavailableKeys])
      showBulkResult(
        result.startedKeys.length,
        result.skippedKeys.length + unavailableKeys.length,
        result.failedKeys.length,
      )
    } finally {
      setBulkBusy(false)
    }
  }

  const handleBulkMove = (folderId: string | null) => {
    const selectedKeys = bulkSelection.selectedKeys
    setLibraryFolders((current) => cleanLibraryFolders(ensureFavoritesFolder(current).map((folder) => {
      if (folder.id === favoritesFolderId) return folder
      const repoKeys = folder.repoKeys.filter((key) => !selectedKeys.has(key))
      return folder.id === folderId
        ? { ...folder, repoKeys: [...selectedKeys, ...repoKeys] }
        : { ...folder, repoKeys }
    })))
    const count = selectedKeys.size
    bulkSelection.clear()
    showBulkResult(count, 0, 0)
  }

  const handleBulkFavorite = async (nextValue: boolean) => {
    setBulkBusy(true)
    setBulkError(null)
    const skippedRepositories = bulkSelectedRepositories.filter((repo) =>
      favoriteKeys.has(normalizeRepoKey(repo.owner.login, repo.name)) === nextValue,
    )
    const actionableRepositories = bulkSelectedRepositories.filter((repo) =>
      favoriteKeys.has(normalizeRepoKey(repo.owner.login, repo.name)) !== nextValue,
    )
    const result = await runSequentialBulk(
      actionableRepositories,
      (repo) => normalizeRepoKey(repo.owner.login, repo.name),
      async (repo) => {
        if (nextValue) {
          await addToFavorites(repo.owner.login, repo.name, repo.name, repo.description ?? undefined)
        } else {
          await removeFromFavorites(repo.owner.login, repo.name)
        }
        handleFavoriteChange(repo, nextValue)
      },
    )
    const skippedKeys = skippedRepositories.map((repo) =>
      normalizeRepoKey(repo.owner.login, repo.name),
    )
    bulkSelection.remove([...result.succeededKeys, ...skippedKeys])
    showBulkResult(result.succeededKeys.length, skippedKeys.length, result.failedKeys.length)
    setBulkBusy(false)
  }

  const handleBulkCleanup = async () => {
    setBulkBusy(true)
    setBulkError(null)
    const completedKeys: string[] = []
    let success = 0
    let skipped = 0
    let failed = 0

    for (const app of bulkInstalledApps) {
      const key = normalizeRepoKey(app.owner, app.repo)
      const inactive = app.versions.filter((version) => version.tag !== app.activeVersion)
      if (inactive.length === 0) {
        skipped += 1
        completedKeys.push(key)
        continue
      }
      let appFailed = false
      for (const version of inactive) {
        try {
          await uninstallVersion(app.owner, app.repo, version.tag)
        } catch {
          appFailed = true
        }
      }
      if (appFailed) {
        failed += 1
      } else {
        success += 1
        completedKeys.push(key)
      }
    }

    const uninstalledKeys = new Set(bulkInstalledApps.map((app) => normalizeRepoKey(app.owner, app.repo)))
    const notInstalledKeys = bulkSelectedRepositories
      .map((repo) => normalizeRepoKey(repo.owner.login, repo.name))
      .filter((key) => !uninstalledKeys.has(key))
    skipped += notInstalledKeys.length
    bulkSelection.remove([...completedKeys, ...notInstalledKeys])
    await refreshLocalStatus().catch(() => {})
    setBulkConfirm(null)
    showBulkResult(success, skipped, failed)
    setBulkBusy(false)
  }

  const handleBulkUninstall = async () => {
    setBulkBusy(true)
    setBulkError(null)
    const result = await runSequentialBulk(
      bulkInstalledApps,
      (app) => normalizeRepoKey(app.owner, app.repo),
      (app) => uninstallApp(app.owner, app.repo),
    )

    const installedKeys = new Set(bulkInstalledApps.map((app) => normalizeRepoKey(app.owner, app.repo)))
    const notInstalledKeys = bulkSelectedRepositories
      .map((repo) => normalizeRepoKey(repo.owner.login, repo.name))
      .filter((key) => !installedKeys.has(key))
    bulkSelection.remove([...result.succeededKeys, ...notInstalledKeys])
    await refreshLocalStatus().catch(() => {})
    setBulkConfirm(null)
    showBulkResult(result.succeededKeys.length, notInstalledKeys.length, result.failedKeys.length)
    setBulkBusy(false)
  }

  const handleLibraryKeyboard = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    if (target.closest('input, textarea, select, [contenteditable="true"]')) return
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
      event.preventDefault()
      bulkSelection.selectAll()
    } else if (event.key === 'Escape' && bulkSelection.selectedKeys.size > 0) {
      event.preventDefault()
      bulkSelection.clear()
    }
  }

  const renderUpdatesCenter = () => {
    if (filter !== 'updates') return null

    const items = updateRepositories.flatMap((repo): BatchUpdateItem[] => {
      const installedApp = getInstalledApp(repo)
      const latestVersion = getLatestVersion(repo)
      return installedApp && latestVersion
        ? [{ repo, currentVersion: installedApp.activeVersion, latestVersion }]
        : []
    })
    const failedDownload = batchDownloads.find((download) => download.status === 'failed')
    const chooseAnotherRepo = failedDownload
      ? state.repositories.find((repo) =>
        repo.owner.login === failedDownload.owner && repo.name === failedDownload.repo,
      )
      : updateRepositories[0]

    return (
      <BatchUpdatePanel
        items={items}
        skippedCount={activeDismissedUpdateCount}
        lastChecked={formattedLatestVersionsTime}
        checking={checkingUpdates}
        updating={batchUpdating}
        versionErrorCount={latestVersionErrorCount}
        updateMessage={batchUpdateMessage}
        cleanupMessage={batchCleanupMessage}
        onCheck={handleCheckUpdates}
        onUpdateAll={() => { void handleAutomaticUpdates() }}
        onClearSkipped={handleClearSkippedUpdates}
        onUpdate={(repo) => { void handleQuickInstall(repo, true) }}
        onShowDetails={(repo) => {
          detailsReturnFocus.current = document.activeElement as HTMLElement
          selectFeaturedRepo(repo, 'details')
          setDetailsOpen(true)
        }}
        onSkip={handleSkipUpdate}
      >
        <Suspense fallback={null}>
          <DownloadProgressPanel
            compact
            downloads={batchDownloads}
            onCancel={cancelBatchDownload}
            onSetPaused={setBatchDownloadPaused}
            onLaunch={(download) => {
              if (!download.owner || !download.repo) return
              launchApp(download.owner, download.repo).catch(() => {})
            }}
            onOpenFolder={handleBatchOpenFolder}
            onRetry={handleBatchRetry}
            onChooseAnother={() => chooseAnotherRepo && setSelectedRepo(chooseAnotherRepo)}
            onCleanup={handleBatchCleanup}
          />
        </Suspense>
      </BatchUpdatePanel>
    )
  }

  const renderLibraryTrustPanel = () => {
    if (suppressDiagnostics || libraryTrustKind === 'fresh') return null

    const canRetry = !state.loading && !checkingUpdates
    const retryInstalled = Boolean(installedLoadError) && canRetry
    const shouldOfferRetry = Boolean(state.error)
    const shouldOfferUpdateCheck = latestVersionErrorCount > 0 || !latestVersionsCheckedAt

    return (
      <section
        className={`library-trust-panel library-trust-panel--${libraryTrustKind}`}
        aria-live="polite"
      >
        <span className="library-trust-mark" aria-hidden="true" />
        <strong className="library-trust-title">
          {t(`library.trust.${libraryTrustKind}.title`, { count: latestVersionErrorCount })}
        </strong>
        {formattedLatestVersionsTime && (
          <span className="library-trust-context">
            {t('library.trust.versionsCheckedAt', { time: formattedLatestVersionsTime })}
          </span>
        )}
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
          {shouldOfferRetry && libraryTrustKind !== 'checking' && (
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
          {state.error && state.isStale && (
            <details className="library-trust-details">
              <summary>{t('state.details')}</summary>
              <pre>{state.error}</pre>
            </details>
          )}
        </div>
      </section>
    )
  }

  const renderDetailsEmpty = () => {
    if (featuredRepo) return null

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

    return (
      <LibraryHero
        key={featuredRepo.id}
        repo={featuredRepo}
        runtimeStatus={runtimeError && installedApp ? 'unknown' : runtimeByRepo.get(featuredRepoKey ?? '')}
        installedApp={installedApp}
        installationHealth={healthByRepo.get(featuredRepoKey ?? '')}
        latestVersion={latestVersion}
        cover={featuredCover}
        coverStyle={featuredCoverStyle}
        background={featuredBackground}
        backgroundStyle={featuredBackgroundStyle}
        isFavorite={favoriteKeys.has(projectArtKey(featuredRepo.owner.login, featuredRepo.name))}
        favoriteBusy={favoriteBusy}
        canResetCover={Boolean(featuredArt?.coverPath)}
        canResetBackground={Boolean(featuredArt?.backgroundPath)}
        busy={installingKeys.has(featuredRepoKey ?? '') || batchDownloads.some((d) => projectArtKey(d.owner ?? '', d.repo ?? '') === featuredRepoKey && !['completed', 'failed'].includes(currentStage(d)))}
        onInstall={() => { void handleQuickInstall(featuredRepo, Boolean(installedApp)) }}
        onLaunch={() => handleLaunch(featuredRepo)}
        onToggleFavorite={handleToggleFeaturedFavorite}
        onShowDetails={() => setHeroPanel('details')}
        onOpenFolder={() => handleOpenFolder(featuredRepo)}
        onChangeCover={() => handlePickArt('cover')}
        onEditCover={() => handleEditArt('cover')}
        onChangeBackground={() => handlePickArt('background')}
        onEditBackground={() => handleEditArt('background')}
        onResetCover={() => handleClearArt()}
        onResetBackground={() => handleClearArt(featuredRepo, 'background')}
        onUninstall={() => handleRequestUninstall(featuredRepo)}
      />
    )
  }

  const renderOperationsPanel = () => {
    if (!featuredRepo) return null

    const installedApp = getInstalledApp(featuredRepo)
    const latestVersion = getLatestVersion(featuredRepo)

    return (
      <>
        <ProjectGallery key={featuredRepoKey} name={featuredRepo.name} screenshots={defaultScreenshots?.key === featuredRepoKey ? defaultScreenshots.urls : []} />
        <LibraryOperationsPanel
          repo={featuredRepo}
          installedApp={installedApp}
          installationHealth={healthByRepo.get(featuredRepoKey ?? '')}
          latestVersion={latestVersion}
          installationPath={settings.installationPath}
          updating={batchUpdating || installingKeys.has(featuredRepoKey ?? '')}
          runtimeStatus={runtimeError && installedApp ? 'unknown' : runtimeByRepo.get(featuredRepoKey ?? '')}
          onInstall={() => { void handleQuickInstall(featuredRepo, Boolean(installedApp)) }}
          onUpdate={() => { void handleQuickInstall(featuredRepo, true) }}
          onLaunch={() => handleLaunch(featuredRepo)}
        />
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
  const sidebarSectionGroups = [
    {
      id: 'custom',
      label: t('library.folder.myFolders'),
      sections: visibleRepositorySections.filter(
        (section) => section.id !== favoritesFolderId && section.id !== uncategorizedFolderId,
      ),
    },
    {
      id: 'system',
      label: t('library.folder.systemSections'),
      sections: visibleRepositorySections.filter(
        (section) => section.id === favoritesFolderId || section.id === uncategorizedFolderId,
      ),
    },
  ].filter((group) => group.sections.length > 0)

  const renderSidebarRepository = (repo: GitHubSearchResult) => {
    const key = projectArtKey(repo.owner.login, repo.name)
    const activeDownload = batchDownloads.find((download) =>
      projectArtKey(download.owner ?? '', download.repo ?? '') === key
      && !['completed', 'failed'].includes(currentStage(download)),
    )
    const addableFolders = displayFolders
      .filter((folder) => !folder.repoKeys.includes(key))
      .map((folder) => ({
        id: folder.id,
        name: folder.id === favoritesFolderId ? t('library.folder.favorites') : folder.name,
      }))
    const removableFolders = displayFolders
      .filter((folder) => folder.repoKeys.includes(key))
      .map((folder) => ({
        id: folder.id,
        name: folder.id === favoritesFolderId ? t('library.folder.favorites') : folder.name,
      }))

    return (
      <RepoCard
        viewMode={libraryViewMode}
        key={repo.id}
        repo={repo}
        installedApp={getInstalledApp(repo)}
        installationHealth={healthByRepo.get(key)}
        runtimeStatus={runtimeError && getInstalledApp(repo) ? 'unknown' : runtimeByRepo.get(key)}
        discovered={discoveredApps.filter((app) => projectArtKey(app.owner, app.repo) === key)}
        onAdopt={handleAdopt}
        latestVersion={getLatestVersion(repo)}
        art={projectArt[key]}
        defaultIcon={defaultIcons[key]}
        download={activeDownload ?? batchDownloads.filter((d) => projectArtKey(d.owner ?? '', d.repo ?? '') === key).at(-1)}
        onCancelDownload={cancelBatchDownload}
        onSetDownloadPaused={setBatchDownloadPaused}
        releaseDate={getReleaseDate(repo)}
        onRetryDownload={handleBatchRetry}
        isFavorite={favoriteKeys.has(key)}
        isSelected={featuredRepo?.id === repo.id || recentlyInstalledKey === key}
        isBulkSelected={bulkSelection.selectedKeys.has(key)}
        onBulkSelect={repo.website_url ? undefined : (range) => {
          setBulkMessage(null)
          setBulkError(null)
          bulkSelection.select(key, range)
        }}
        onPreview={() => {
          bulkSelection.clear()
          detailsReturnFocus.current = document.activeElement as HTMLElement
          selectFeaturedRepo(repo)
          setDetailsOpen(true)
        }}
        onFavoriteChange={(nextValue) => handleFavoriteChange(repo, nextValue)}
        onPickArt={() => handlePickArt('cover', repo)}
        onEditArt={() => handleEditArt('cover', repo)}
        onPickBackground={(target) => handlePickArt('background', repo, libraryViewMode === 'table' ? 'row' : 'card', target)}
        onEditBackground={(target) => handleEditArt('background', repo, libraryViewMode === 'table' ? 'row' : 'card', target)}
        onClearArt={() => handleClearArt(repo, 'cover')}
        onClearBackground={() => handleClearArt(repo, 'background')}
        onUninstall={() => handleRequestUninstall(repo)}
        onOpenFolder={() => handleOpenFolder(repo)}
        onShowVersions={repo.website_url ? undefined : () => {
          setSelectedRepo(repo)
        }}
        onInstall={() => { void handleQuickInstall(repo, Boolean(getInstalledApp(repo))) }}
        onLaunch={() => handleLaunch(repo)}
        onError={(error) => handleInstallError(error instanceof Error ? error.message : t('errors.commandFailed'))}
        busy={Boolean(activeDownload) || installingKeys.has(key) || adoptingKey === key}
        folders={addableFolders}
        removableFolders={removableFolders}
        onCreateFolder={() => openCreateFolderDialog(repo)}
        onMoveToFolder={(folderId) => handleMoveToFolder(repo, folderId)}
        onRemoveFromFolder={(folderId) => handleRemoveFromFolder(repo, folderId)}
        onMoveToUncategorized={removableFolders.length > 0
          ? () => handleMoveToUncategorized(repo)
          : undefined}
      />
    )
  }

  const libraryToastError = batchUpdateError ?? libraryActionError
  const libraryToastWarning = !libraryToastError && manualUpdateRepo
    ? t('updates.noPortableAssets')
    : null
  const libraryToastMessage = libraryToastError ?? libraryToastWarning ?? libraryActionMessage
  const libraryToastTone = libraryToastError ? 'error' : libraryToastWarning ? 'warning' : 'success'
  const libraryToast = useToastPresence(libraryToastMessage)
  const libraryToastToneRef = useRef(libraryToastTone)
  if (libraryToastMessage) libraryToastToneRef.current = libraryToastTone

  return (
    <div
      className={`page library-page library-catalog library-view-${libraryViewMode}`}
      onKeyDown={handleLibraryKeyboard}
    >
      <div className="library-sam-workspace">
          <LibrarySidebar
            filter={filter}
            sort={sort}
            viewMode={libraryViewMode}
            query={query}
            summary={<Suspense fallback={<StatePanel kind="loading" title={t('library.loading')} />}>{renderUpdatesCenter()}</Suspense>}
            details={detailsOpen && (
              <aside
                className="library-sam-details-pane library-catalog-details"
                aria-label={featuredRepo?.name ?? t('details.open')}
                ref={detailsPaneRef}
                tabIndex={-1}
                onKeyDown={(event) => {
                  if (event.key === 'Escape' && !event.defaultPrevented) closeDetails()
                }}
              >
                <div className="library-catalog-details-toolbar">
                  <h2>{featuredRepo?.name ?? t('details.open')}</h2>
                  <button type="button" className="secondary-btn" onClick={closeDetails}>
                    <CloseIcon />{t('release.close')}
                  </button>
                </div>
                <Suspense fallback={<StatePanel kind="loading" title={t('library.loading')} />}>
                  {renderDetailsEmpty()}
                  {renderHero()}
                  {renderOperationsPanel()}
                  {heroPanel === 'details' && renderLibraryTrustPanel()}
                </Suspense>
              </aside>
            )}
            groups={sidebarSectionGroups}
            collapsedFolderIds={collapsedFolderIds}
            notices={(
              <>
                {(runtimeError || discoveryError) && <StatePanel kind="error" title={t(runtimeError ? 'repo.runtimeUnknown' : 'repo.discoveryFailed')}
                  message={runtimeError ?? discoveryError ?? ''} actionLabel={t('library.tryAgain')} onAction={() => { void refreshRuntime(); void refreshDiscovered() }} />}
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
              </>
            )}
            bulkActions={bulkSelection.selectedKeys.size > 0 ? (
              <Suspense fallback={null}>
                <LibraryBulkActions
                  selectedCount={bulkSelection.selectedKeys.size}
                  visibleCount={orderedVisibleKeys.length}
                  updateCount={bulkUpdateRepositories.length}
                  installedCount={bulkInstalledApps.length}
                  cleanupVersionCount={bulkInactiveVersions.length}
                  busy={bulkBusy}
                  folders={displayFolders
                    .filter((folder) => folder.id !== favoritesFolderId)
                    .map((folder) => ({ id: folder.id, name: folder.name }))}
                  message={bulkMessage}
                  error={bulkError}
                  onSelectAll={bulkSelection.selectAll}
                  onClear={bulkSelection.clear}
                  onUpdate={handleBulkUpdate}
                  onMoveToFolder={handleBulkMove}
                  onAddFavorite={() => handleBulkFavorite(true)}
                  onRemoveFavorite={() => handleBulkFavorite(false)}
                  onRequestCleanup={() => {
                    setBulkError(null)
                    setBulkConfirm('cleanup')
                  }}
                  onRequestUninstall={() => {
                    setBulkError(null)
                    setBulkConfirm('uninstall')
                  }}
                />
              </Suspense>
            ) : null}
            showLoading={showLoadingState}
            showEmpty={visibleRepositories.length === 0 && !state.loading}
            emptyTitle={t(emptyTitleKey)}
            emptyMessage={t(emptyTextKey)}
            emptyActionLabel={emptyActionLabel}
            loading={state.loading}
            refreshing={refreshingLibrary || state.loading || checkingUpdates}
            hasMore={state.hasMore}
            onFilterChange={(nextFilter) => {
              setDetailsOpen(false)
              bulkSelection.clear()
              if (nextFilter === 'updates') {
                detailsScrollTopRef.current = 0
                if (detailsPaneRef.current) detailsPaneRef.current.scrollTop = 0
              }
              handleFilterChange(nextFilter)
            }}
            onSortChange={(nextSort) => {
              setDetailsOpen(false)
              bulkSelection.clear()
              handleSortChange(nextSort)
            }}
            onViewModeChange={setLibraryViewMode}
            onQueryChange={(nextQuery) => {
              setDetailsOpen(false)
              bulkSelection.clear()
              setQuery(nextQuery)
            }}
            onToggleSection={(sectionId) => {
              bulkSelection.clear()
              toggleFolderSection(sectionId)
            }}
            onEmptyAction={emptyAction}
            onLoadMore={loadMore}
            onRefresh={() => { void handleRefresh() }}
            renderRepository={renderSidebarRepository}
            resultsRef={sidebarResultsRef}
            onResultsScroll={(event) => {
              sidebarScrollTopRef.current = event.currentTarget.scrollTop
              scheduleLibraryViewPersistence()
            }}
          />

          <footer className="library-catalog-status" role="status" aria-live="polite" aria-atomic="true">
            {refreshingLibrary || state.loading
              ? t('library.refreshing')
              : state.error
                ? t(state.repositories.length ? 'library.catalog.cached' : 'library.catalog.unavailable')
                : state.lastLoadedAt
                  ? t('library.catalog.loadedAt', { time: formatTime(state.lastLoadedAt) ?? '' })
                  : t('library.loading')}
          </footer>
        </div>

      {selectedRepo && (
        <Suspense
          fallback={(
            <div className="modal-overlay">
              <div className="modal-content release-modal-loading" role="status" aria-live="polite">
                <StatePanel kind="loading" title={t('release.loading')} skeletonCount={3} />
              </div>
            </div>
          )}
        >
          <ReleaseSelector
            owner={selectedRepo.owner.login}
            repo={selectedRepo.name}
            displayName={selectedRepo.name}
            description={selectedRepo.description ?? undefined}
            currentVersion={getInstalledApp(selectedRepo)?.activeVersion}
            initialStep={releasePickerStartsAtFile ? 'file' : 'version'}
            onClose={() => { setSelectedRepo(null); setReleasePickerStartsAtFile(false) }}
            onInstalled={handleInstalledFromRelease}
            onError={handleInstallError}
          />
        </Suspense>
      )}

      {uninstallTarget && (
        <Suspense fallback={null}>
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
        </Suspense>
      )}

      {folderDialogRepo && (
        <Suspense fallback={null}>
          <FolderManager
            key={folderDialogRepo.id}
            targetName={folderDialogRepo.name}
            existingNames={[
              ...displayFolders.map((folder) => folder.name),
              t('library.folder.favorites'),
            ]}
            onCancel={closeCreateFolderDialog}
            onConfirm={handleConfirmCreateFolder}
          />
        </Suspense>
      )}

      {bulkConfirm && (
        <Suspense fallback={null}>
          <LibraryBulkConfirmDialog
            action={bulkConfirm}
            appCount={bulkConfirm === 'cleanup'
              ? new Set(bulkInactiveVersions.map((item) => normalizeRepoKey(item.app.owner, item.app.repo))).size
              : bulkInstalledApps.length}
            versionCount={bulkConfirm === 'cleanup'
              ? bulkInactiveVersions.length
              : bulkInstalledApps.reduce((sum, app) => sum + app.versions.length, 0)}
            sizeBytes={bulkConfirm === 'cleanup' ? bulkCleanupSize : bulkUninstallSize}
            busy={bulkBusy}
            error={bulkError}
            onCancel={() => !bulkBusy && setBulkConfirm(null)}
            onConfirm={bulkConfirm === 'cleanup' ? handleBulkCleanup : handleBulkUninstall}
          />
        </Suspense>
      )}

      {pendingArtCrop && (
        <Suspense fallback={null}>
          <ArtCropDialog
            kind={pendingArtCrop.kind}
            previewShape={pendingArtCrop.kind === 'cover' ? 'cover' : pendingArtCrop.previewShape}
            initialPreviewMode="normal"
            previewAspectRatios={pendingArtCrop.previewAspectRatios}
            sourcePath={pendingArtCrop.sourcePath}
            initialCrop={pendingArtCrop.initialCrop}
            onCancel={() => setPendingArtCrop(null)}
            onError={handleInstallError}
            onSave={handleSaveArtCrop}
          />
        </Suspense>
      )}

      {libraryToast.message && typeof document !== 'undefined' && createPortal(
        <div
          className={`library-toast library-toast--${libraryToastToneRef.current} ${libraryToast.visible ? 'is-visible' : ''}`}
          role={libraryToastToneRef.current === 'error' ? 'alert' : 'status'}
          aria-live={libraryToastToneRef.current === 'error' ? 'assertive' : 'polite'}
          aria-atomic="true"
        >
          <span>{libraryToast.message}</span>
          {manualUpdateRepo && libraryToastToneRef.current !== 'error' && (
            <button
              type="button"
              className="secondary-btn library-toast-action"
              onClick={() => {
                setSelectedRepo(manualUpdateRepo)
                setManualUpdateRepo(null)
              }}
            >
              {t('updates.chooseFile')}
            </button>
          )}
        </div>,
        document.body,
      )}
    </div>
  )
}

export default LibraryPage
