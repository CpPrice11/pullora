import { useCallback, useEffect, useMemo, useState } from 'react'
import { arch as getArch, platform as getPlatform, type Platform } from '@tauri-apps/plugin-os'
import type { FavoriteApp, GitHubRelease, GitHubSearchResult, InstalledApp, ProjectArt } from '../../../types'
import { getReleases, listOwnerRepositories } from '../../../services/github'
import { addToFavorites, getFavorites, removeFromFavorites } from '../../../services/favorites'
import { getInstalledApps } from '../../../services/installed'
import { listProjectArt, projectArtKey } from '../../../services/projectArt'
import {
  classifyReleaseAsset,
  hasInstallableReleaseAsset,
  installableAssetsForRelease,
  type ReleaseAssetArchitecture,
  type ReleaseAssetKind,
  type ReleaseRuntime,
} from '../assetClassifier'
import { isStoreApplicationProject } from '../projectClassifier'
import {
  filterReposForStorePlatform,
  matchesLocalQuery,
  repoKey,
  type StoreBrowseTab,
  type StoreInstallableFilter,
  type StorePlatform,
  type StoreProjectFilter,
} from '../storeCatalog'
import type { StoreInstallability, StoreSection } from '../storeTypes'

interface StoreInstallabilityCacheEntry {
  checkedAt: number
  status: Omit<StoreInstallability, 'checking'>
}

const installabilityCacheKey = 'pullora.store.installability.v2'
const installabilityCacheTtlMs = 24 * 60 * 60 * 1000
const installabilityAutoCheckLimit = 6
const ownerStoreBrowseTabs: StoreBrowseTab[] = ['popular', 'updated', 'releases', 'favorites']

function classifyStoreError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const normalized = message.toLowerCase()
  if (normalized.includes('rate limit') || normalized.includes('403')) return 'store.error.rateLimit'
  if (
    normalized.includes('timed out')
    || normalized.includes('dns')
    || normalized.includes('network')
    || normalized.includes('connection')
  ) {
    return 'store.error.offline'
  }
  return 'store.error.load'
}

function normalizePlatform(value: Platform | null | undefined): StorePlatform {
  switch (value) {
    case 'windows':
    case 'macos':
    case 'linux':
    case 'ios':
    case 'android':
      return value
    default:
      return 'other'
  }
}

function readRuntime(): ReleaseRuntime {
  let platform: StorePlatform = null
  let architecture: ReleaseAssetArchitecture = 'unknown'
  try {
    platform = normalizePlatform(getPlatform())
  } catch {
    platform = null
  }
  try {
    const value = getArch()
    architecture = value === 'x86_64'
      ? 'x64'
      : value === 'aarch64'
        ? 'arm64'
        : value === 'x86'
          ? 'x86'
          : value === 'arm'
            ? 'arm'
            : 'unknown'
  } catch {
    architecture = 'unknown'
  }
  return { platform, architecture }
}

function readInstallabilityCache(): Record<string, StoreInstallabilityCacheEntry> {
  try {
    const raw = window.localStorage.getItem(installabilityCacheKey)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function readCachedInstallability(
  key: string,
  runtime: ReleaseRuntime,
  allowStale = false,
): StoreInstallability | null {
  const entry = readInstallabilityCache()[key]
  if (!entry) return null
  if (!allowStale && Date.now() - entry.checkedAt > installabilityCacheTtlMs) return null
  if (
    entry.status.platform !== runtime.platform
    || entry.status.architecture !== runtime.architecture
  ) {
    return null
  }
  return { ...entry.status, checked: true, checking: false, source: 'cache' }
}

function writeCachedInstallability(key: string, status: StoreInstallability) {
  try {
    const cache = readInstallabilityCache()
    cache[key] = {
      checkedAt: Date.now(),
      status: {
        checked: true,
        installable: status.installable,
        source: status.source ?? 'release',
        latestTag: status.latestTag ?? null,
        assetKinds: status.assetKinds ?? [],
        installableAssetCount: status.installableAssetCount ?? 0,
        incompatibleAssetCount: status.incompatibleAssetCount ?? 0,
        platform: status.platform ?? null,
        architecture: status.architecture ?? 'unknown',
      },
    }
    window.localStorage.setItem(installabilityCacheKey, JSON.stringify(cache))
  } catch {
    // Installability cache is optional.
  }
}

function pickLatestInstallableRelease(releases: GitHubRelease[], runtime: ReleaseRuntime) {
  return releases.find((release) =>
    !release.draft && !release.prerelease && hasInstallableReleaseAsset(release, runtime),
  ) ?? releases.find((release) =>
    !release.draft && hasInstallableReleaseAsset(release, runtime),
  ) ?? null
}

function installabilityFromRelease(
  release: GitHubRelease | null,
  runtime: ReleaseRuntime,
): StoreInstallability {
  const assets = release ? installableAssetsForRelease(release, runtime) : []
  const supportedAssetCount = release?.assets.filter(
    (asset) => classifyReleaseAsset(asset) !== 'unsupported',
  ).length ?? 0
  return {
    checked: true,
    checking: false,
    installable: assets.length > 0,
    source: 'release',
    latestTag: release?.tag_name ?? null,
    assetKinds: [...new Set(assets.map(classifyReleaseAsset))] as ReleaseAssetKind[],
    installableAssetCount: assets.length,
    incompatibleAssetCount: Math.max(supportedAssetCount - assets.length, 0),
    platform: runtime.platform,
    architecture: runtime.architecture,
  }
}

function ownerKey(owner: string, repo: string) {
  return `${owner}/${repo}`.toLowerCase()
}

export function useOwnerStoreCatalog(
  owner: string | undefined,
  searchQuery: string,
  browseTab: StoreBrowseTab,
  installableFilter: StoreInstallableFilter,
  projectFilter: StoreProjectFilter,
) {
  const [runtime] = useState<ReleaseRuntime>(readRuntime)
  const storePlatform: StorePlatform = runtime.platform === 'unknown' ? null : runtime.platform
  const [repositories, setRepositories] = useState<GitHubSearchResult[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [favorites, setFavorites] = useState<FavoriteApp[]>([])
  const [installedApps, setInstalledApps] = useState<InstalledApp[]>([])
  const [projectArt, setProjectArt] = useState<Record<string, ProjectArt>>({})
  const [installability, setInstallability] = useState<Record<string, StoreInstallability>>({})

  const normalizedOwner = owner?.trim() ?? ''
  const ownerRepositories = useMemo(
    () => filterReposForStorePlatform(repositories, storePlatform),
    [repositories, storePlatform],
  )

  const favoriteKeys = useMemo(
    () => new Set(favorites.map((item) => ownerKey(item.owner, item.repo))),
    [favorites],
  )
  const installedByRepo = useMemo(
    () => new Map(installedApps.map((app) => [ownerKey(app.owner, app.repo), app])),
    [installedApps],
  )

  const refreshLocalState = useCallback(async () => {
    const [favoriteItems, apps, art] = await Promise.all([
      getFavorites().catch(() => []),
      getInstalledApps().catch(() => []),
      listProjectArt().catch(() => []),
    ])
    setFavorites(favoriteItems)
    setInstalledApps(apps)
    setProjectArt(Object.fromEntries(
      art.map((item) => [projectArtKey(item.owner, item.repo), item]),
    ))
  }, [])

  const loadOwnerRepositories = useCallback(async (nextPage = 1, forceRefresh = false) => {
    if (!normalizedOwner) {
      setRepositories([])
      setPage(1)
      setHasMore(false)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const result = await listOwnerRepositories(normalizedOwner, nextPage, false, forceRefresh)
      setRepositories((current) => nextPage === 1 ? result.items : [...current, ...result.items])
      setPage(result.page)
      setHasMore(result.has_more)
    } catch (loadError) {
      setError(classifyStoreError(loadError))
    } finally {
      setLoading(false)
    }
  }, [normalizedOwner])

  useEffect(() => {
    void refreshLocalState()
  }, [refreshLocalState])

  useEffect(() => {
    setRepositories([])
    setInstallability({})
    if (normalizedOwner) void loadOwnerRepositories(1)
  }, [loadOwnerRepositories, normalizedOwner])

  const checkInstallability = useCallback(async (repo: GitHubSearchResult) => {
    const key = repoKey(repo)
    const current = installability[key]
    if (current?.checking || current?.checked) return current

    const cached = readCachedInstallability(key, runtime)
    if (cached) {
      setInstallability((state) => ({ ...state, [key]: cached }))
      return cached
    }

    setInstallability((state) => ({
      ...state,
      [key]: { checked: false, checking: true, installable: false },
    }))
    try {
      const releases = await getReleases(repo.owner.login, repo.name)
      const status = installabilityFromRelease(
        pickLatestInstallableRelease(releases, runtime),
        runtime,
      )
      writeCachedInstallability(key, status)
      setInstallability((state) => ({ ...state, [key]: status }))
      return status
    } catch {
      const status = readCachedInstallability(key, runtime, true) ?? {
        checked: false,
        checking: false,
        installable: false,
        source: 'degraded' as const,
        latestTag: null,
      }
      setInstallability((state) => ({ ...state, [key]: status }))
      return status
    }
  }, [installability, runtime])

  useEffect(() => {
    if (installableFilter !== 'installable' && browseTab !== 'releases') return
    ownerRepositories.slice(0, installabilityAutoCheckLimit).forEach((repo) => {
      void checkInstallability(repo)
    })
  }, [browseTab, checkInstallability, installableFilter, ownerRepositories])

  const filteredItems = useMemo(() => {
    const items = ownerRepositories
      .filter((repo) => matchesLocalQuery(repo, searchQuery))
      .filter((repo) => projectFilter === 'all' || isStoreApplicationProject(repo))
      .filter((repo) => browseTab !== 'favorites' || favoriteKeys.has(repoKey(repo)))
      .filter((repo) =>
        installableFilter === 'all' && browseTab !== 'releases'
          ? true
          : installability[repoKey(repo)]?.installable,
      )

    return [...items].sort((left, right) => {
      if (browseTab === 'popular' || browseTab === 'releases') {
        return right.stargazers_count - left.stargazers_count
      }
      if (browseTab === 'new') {
        return left.name.localeCompare(right.name)
      }
      return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime()
    })
  }, [
    browseTab,
    favoriteKeys,
    installability,
    installableFilter,
    ownerRepositories,
    projectFilter,
    searchQuery,
  ])

  const homeSections = useMemo<StoreSection[]>(() => {
    const applications = ownerRepositories.filter(isStoreApplicationProject)
    return [
      {
        id: 'owner',
        titleKey: 'store.section.ownerProjects',
        subtitleKey: 'store.section.ownerProjectsText',
        items: (applications.length > 0 ? applications : ownerRepositories).slice(0, 12),
      },
      {
        id: 'updated',
        titleKey: 'store.section.updated',
        subtitleKey: 'store.section.updatedText',
        items: [...ownerRepositories]
          .sort((left, right) =>
            new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime(),
          )
          .slice(0, 12),
      },
    ]
  }, [ownerRepositories])

  const favoriteRepos = ownerRepositories.filter((repo) => favoriteKeys.has(repoKey(repo)))
  const installedRepos = ownerRepositories.filter((repo) => installedByRepo.has(repoKey(repo)))

  const toggleFavorite = useCallback(async (repo: GitHubSearchResult) => {
    const key = repoKey(repo)
    const isFavorite = favoriteKeys.has(key)
    if (isFavorite) {
      await removeFromFavorites(repo.owner.login, repo.name)
    } else {
      await addToFavorites(repo.owner.login, repo.name, repo.name, repo.description ?? undefined)
    }
    await refreshLocalState()
  }, [favoriteKeys, refreshLocalState])

  const refreshAll = useCallback(async () => {
    setInstallability({})
    await Promise.all([loadOwnerRepositories(1, true), refreshLocalState()])
  }, [loadOwnerRepositories, refreshLocalState])

  return {
    browseItems: filteredItems,
    browseTabs: ownerStoreBrowseTabs,
    checkInstallability,
    error,
    favoriteKeys,
    favoriteRepos,
    fallbackRepos: [] as GitHubSearchResult[],
    hasMoreBrowse: hasMore,
    homeSections,
    installability,
    installedByRepo,
    installedRepos,
    loadingBrowse: loading,
    loadingInstallability: ownerRepositories.some((repo) => installability[repoKey(repo)]?.checking),
    loadMoreBrowse: () => {
      if (!loading && hasMore) void loadOwnerRepositories(page + 1)
    },
    projectArt,
    projectFilter,
    personalized: false,
    refreshAll,
    refreshLocalState,
    toggleFavorite,
    runtime,
  }
}
