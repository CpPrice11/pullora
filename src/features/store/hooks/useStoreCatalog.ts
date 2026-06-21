import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { arch as getArch, platform as getPlatform, type Platform } from '@tauri-apps/plugin-os'
import type { FavoriteApp, GitHubRelease, GitHubSearchResult, InstalledApp, ProjectArt } from '../../../types'
import {
  cancelQueuedGithubRequests,
  getReleases,
  isGithubRequestCancelled,
  searchPublicRepositories,
} from '../../../services/github'
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
  browseOptions,
  fallbackStoreRepos,
  filterReposForStorePlatform,
  matchesLocalQuery,
  repoKey,
  storeBrowseTabs,
  uniqueRepos,
  type StoreBrowseTab,
  type StoreInstallableFilter,
  type StorePlatform,
  type StoreProjectFilter,
} from '../storeCatalog'

export interface StoreInstallability {
  checked: boolean
  checking: boolean
  installable: boolean
  source?: 'release' | 'cache' | 'degraded'
  latestTag?: string | null
  assetKinds?: ReleaseAssetKind[]
  installableAssetCount?: number
  incompatibleAssetCount?: number
  platform?: ReleaseRuntime['platform']
  architecture?: ReleaseAssetArchitecture
}

export interface StoreSection {
  id: string
  titleKey: string
  subtitleKey: string
  items: GitHubSearchResult[]
}

interface StoreInstallabilityCacheEntry {
  checkedAt: number
  status: Omit<StoreInstallability, 'checking'>
}

interface LibraryRepoRef {
  owner: string
  repo: string
  description?: string
}

const installabilityCacheKey = 'pullora.store.installability.v2'
const installabilityCacheTtlMs = 24 * 60 * 60 * 1000
const installabilityAutoCheckLimit = 6
const storeBrowseRequestGroup = 'store-browse'

function classifyStoreError(error: unknown) {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : ''
  const normalized = message.toLowerCase()

  if (normalized.includes('rate limit') || normalized.includes('403')) {
    return 'store.error.rateLimit'
  }

  if (
    normalized.includes('timed out')
    || normalized.includes('dns')
    || normalized.includes('network')
    || normalized.includes('failed to send request')
    || normalized.includes('error sending request')
    || normalized.includes('connection')
  ) {
    return 'store.error.offline'
  }

  return 'store.error.load'
}

function installedKey(app: InstalledApp) {
  return `${app.owner}/${app.repo}`.toLowerCase()
}

function favoriteKey(app: FavoriteApp) {
  return `${app.owner}/${app.repo}`.toLowerCase()
}

function refKey(ref: LibraryRepoRef) {
  return `${ref.owner}/${ref.repo}`.toLowerCase()
}

function pickLatestInstallableRelease(releases: GitHubRelease[], runtime: ReleaseRuntime) {
  return releases.find((release) =>
    !release.draft &&
    !release.prerelease &&
    hasInstallableReleaseAsset(release, runtime),
  ) ?? releases.find((release) =>
    !release.draft &&
    hasInstallableReleaseAsset(release, runtime),
  ) ?? releases.find((release) =>
    !release.draft &&
    !release.prerelease &&
    release.assets.some((asset) => classifyReleaseAsset(asset) !== 'unsupported'),
  ) ?? releases.find((release) =>
    !release.draft &&
    release.assets.some((asset) => classifyReleaseAsset(asset) !== 'unsupported'),
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
    assetKinds: [...new Set(assets.map(classifyReleaseAsset))],
    installableAssetCount: assets.length,
    incompatibleAssetCount: Math.max(supportedAssetCount - assets.length, 0),
    platform: runtime.platform,
    architecture: runtime.architecture,
  }
}

function toCachedInstallability(status: StoreInstallability): Omit<StoreInstallability, 'checking'> {
  return {
    checked: true,
    installable: status.installable,
    source: status.source ?? 'release',
    latestTag: status.latestTag ?? null,
    assetKinds: status.assetKinds ?? [],
    installableAssetCount: status.installableAssetCount ?? 0,
    incompatibleAssetCount: status.incompatibleAssetCount ?? 0,
    platform: status.platform ?? null,
    architecture: status.architecture ?? 'unknown',
  }
}

function fromCachedInstallability(status: Omit<StoreInstallability, 'checking'>): StoreInstallability {
  return {
    ...status,
    checked: true,
    checking: false,
    source: 'cache',
  }
}

function readInstallabilityCache(): Record<string, StoreInstallabilityCacheEntry> {
  try {
    const raw = window.localStorage.getItem(installabilityCacheKey)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeInstallabilityCache(cache: Record<string, StoreInstallabilityCacheEntry>) {
  try {
    window.localStorage.setItem(installabilityCacheKey, JSON.stringify(cache))
  } catch {
    // Cache failure should never block Store browsing.
  }
}

function readCachedInstallability(
  key: string,
  runtime: ReleaseRuntime,
  allowStale = false,
): StoreInstallability | null {
  const entry = readInstallabilityCache()[key]
  if (!entry) return null

  const isFresh = Date.now() - entry.checkedAt <= installabilityCacheTtlMs
  if (!isFresh && !allowStale) return null
  if (
    entry.status.platform !== runtime.platform
    || entry.status.architecture !== runtime.architecture
  ) {
    return null
  }

  return fromCachedInstallability(entry.status)
}

function writeCachedInstallability(key: string, status: StoreInstallability) {
  const cache = readInstallabilityCache()
  cache[key] = {
    checkedAt: Date.now(),
    status: toCachedInstallability(status),
  }
  writeInstallabilityCache(cache)
}

function normalizeStorePlatform(value: Platform | null | undefined): StorePlatform {
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

function readCurrentPlatform(): StorePlatform {
  try {
    return normalizeStorePlatform(getPlatform())
  } catch {
    return null
  }
}

function normalizeStoreArchitecture(value: string | null | undefined): ReleaseAssetArchitecture {
  switch (value) {
    case 'x86_64':
      return 'x64'
    case 'aarch64':
      return 'arm64'
    case 'x86':
      return 'x86'
    case 'arm':
      return 'arm'
    default:
      return 'unknown'
  }
}

function readCurrentArchitecture(): ReleaseAssetArchitecture {
  try {
    return normalizeStoreArchitecture(getArch())
  } catch {
    return 'unknown'
  }
}

function inferBroadTopicsFromText(text: string) {
  const normalized = text.toLowerCase()
  const topics: string[] = []

  if (/\b(ai|llm|gpt|openai|chatbot|agent)\b/.test(normalized)) topics.push('ai')
  if (/\b(game|gaming|game-engine|unity|unreal)\b/.test(normalized)) topics.push('game')
  if (/\b(desktop|electron|tauri|native-app|windows-app)\b/.test(normalized)) topics.push('desktop-application')
  if (/\b(tool|tools|cli|utility|productivity|developer-tool|devtool|manager|translator)\b/.test(normalized)) topics.push('tool')

  return topics
}

function repoSearchBody(repo: GitHubSearchResult) {
  return [
    repo.name,
    repo.full_name,
    repo.description ?? '',
    repo.language ?? '',
    ...(repo.topics ?? []),
  ].join(' ').toLowerCase()
}

function inferBroadTopics(repo: GitHubSearchResult) {
  return inferBroadTopicsFromText(repoSearchBody(repo))
}

function libraryRefText(ref: LibraryRepoRef) {
  return [ref.owner, ref.repo, ref.description ?? ''].join(' ').toLowerCase()
}

const ignoredTerms = new Set(['github', 'desktop', 'application', 'manager', 'project', 'source'])

function keywordTerms(text: string) {
  return text
    .split(/[^a-z0-9+#.-]+/i)
    .map((term) => term.trim().toLowerCase())
    .filter((term) => term.length >= 3 && !ignoredTerms.has(term))
    .slice(0, 10)
}

function scorePersonalizedRepo(repo: GitHubSearchResult, refs: LibraryRepoRef[]) {
  const repoText = repoSearchBody(repo)
  const repoTopics = new Set([
    ...(repo.topics ?? []).map((topic) => topic.toLowerCase()),
    ...inferBroadTopics(repo),
  ])

  let score = Math.log10(repo.stargazers_count + 1) / 10
  refs.forEach((ref) => {
    const refText = libraryRefText(ref)
    keywordTerms(refText).forEach((term) => {
      if (repoText.includes(term)) score += 2
    })
    inferBroadTopicsFromText(refText).forEach((topic) => {
      if (repoTopics.has(topic)) score += 5
    })
  })

  return score
}

function fallbackHomeSections(currentPlatform: StorePlatform): StoreSection[] {
  const fallbackRepos = filterReposForStorePlatform(fallbackStoreRepos, currentPlatform)

  return [
    {
      id: 'recommended',
      titleKey: 'store.section.recommended',
      subtitleKey: 'store.section.recommendedText',
      items: fallbackRepos.slice(0, 6),
    },
    {
      id: 'popular',
      titleKey: 'store.section.popular',
      subtitleKey: 'store.section.popularText',
      items: fallbackRepos,
    },
  ]
}

export function useStoreCatalog(
  searchQuery: string,
  browseTab: StoreBrowseTab,
  installableFilter: StoreInstallableFilter,
  projectFilter: StoreProjectFilter,
  remoteBrowsingEnabled = false,
) {
  const [currentPlatform] = useState<StorePlatform>(() => readCurrentPlatform())
  const [currentArchitecture] = useState<ReleaseAssetArchitecture>(() => readCurrentArchitecture())
  const [homeSections] = useState<StoreSection[]>(() => fallbackHomeSections(currentPlatform))
  const [browseItemsRaw, setBrowseItemsRaw] = useState<GitHubSearchResult[]>(() =>
    filterReposForStorePlatform(fallbackStoreRepos, currentPlatform),
  )
  const [browsePage, setBrowsePage] = useState(1)
  const [hasMoreBrowse, setHasMoreBrowse] = useState(false)
  const [loadingBrowse, setLoadingBrowse] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [favoriteKeys, setFavoriteKeys] = useState<Set<string>>(new Set())
  const [favoriteApps, setFavoriteApps] = useState<FavoriteApp[]>([])
  const [installedApps, setInstalledApps] = useState<InstalledApp[]>([])
  const [projectArt, setProjectArt] = useState<Record<string, ProjectArt>>({})
  const [installability, setInstallability] = useState<Record<string, StoreInstallability>>({})
  const browseRequestGeneration = useRef(0)
  const runtime = useMemo<ReleaseRuntime>(() => ({
    platform: currentPlatform,
    architecture: currentArchitecture,
  }), [currentArchitecture, currentPlatform])
  const platformFallbackRepos = useMemo(() => {
    return filterReposForStorePlatform(fallbackStoreRepos, currentPlatform)
  }, [currentPlatform])

  const libraryKeys = useMemo(() => {
    return new Set([
      ...installedApps.map(installedKey),
      ...favoriteApps.map(favoriteKey),
    ])
  }, [favoriteApps, installedApps])

  const libraryRefs = useMemo(() => {
    const seenRefs = new Set<string>()
    return [
      ...installedApps.map((app): LibraryRepoRef => ({ owner: app.owner, repo: app.repo })),
      ...favoriteApps.map((app): LibraryRepoRef => ({
        owner: app.owner,
        repo: app.repo,
        description: app.description,
      })),
    ].filter((ref) => {
      const key = refKey(ref)
      if (seenRefs.has(key)) return false
      seenRefs.add(key)
      return true
    })
  }, [favoriteApps, installedApps])

  const personalizedItems = useMemo(() => {
    if (libraryRefs.length === 0) return []

    const candidates = uniqueRepos([
      ...homeSections.flatMap((section) => section.items),
      ...browseItemsRaw,
      ...platformFallbackRepos,
    ])
      .filter((repo) => !libraryKeys.has(repoKey(repo)))
      .filter((repo) => filterReposForStorePlatform([repo], currentPlatform).length > 0)
      .filter((repo) => projectFilter === 'all' || isStoreApplicationProject(repo))

    return candidates
      .map((repo) => ({ repo, score: scorePersonalizedRepo(repo, libraryRefs) }))
      .sort((left, right) => right.score - left.score || right.repo.stargazers_count - left.repo.stargazers_count)
      .slice(0, 12)
      .map((item) => item.repo)
  }, [browseItemsRaw, currentPlatform, homeSections, libraryKeys, libraryRefs, platformFallbackRepos, projectFilter])

  const personalized = personalizedItems.length > 0

  const visibleHomeSections = useMemo(() => {
    const filteredSections = homeSections.map((section) => ({
      ...section,
      items: projectFilter === 'all'
        ? section.items
        : section.items.filter(isStoreApplicationProject),
    }))

    if (personalizedItems.length === 0) return filteredSections

    const recommended = {
      id: 'personalized',
      titleKey: 'store.section.recommended',
      subtitleKey: 'store.section.personalizedText',
      items: personalizedItems,
    }
    const rest = filteredSections.filter((section) => section.id !== 'recommended')
    return [recommended, ...rest]
  }, [homeSections, personalizedItems, projectFilter])

  const installedByRepo = useMemo(() => {
    return new Map(installedApps.map((app) => [installedKey(app), app]))
  }, [installedApps])

  const knownRepos = useMemo(() => {
    const repos = new Map<string, GitHubSearchResult>()
    homeSections.forEach((section) => {
      section.items.forEach((repo) => repos.set(repoKey(repo), repo))
    })
    browseItemsRaw.forEach((repo) => repos.set(repoKey(repo), repo))
    return [...repos.values()]
  }, [browseItemsRaw, homeSections])

  const favoriteRepos = useMemo(() => {
    return knownRepos.filter((repo) => favoriteKeys.has(repoKey(repo)))
  }, [favoriteKeys, knownRepos])

  const installedRepos = useMemo(() => {
    return knownRepos.filter((repo) => installedByRepo.has(repoKey(repo)))
  }, [installedByRepo, knownRepos])

  const browseItems = useMemo(() => {
    const tabSource = browseTab === 'favorites'
      ? favoriteRepos.filter((repo) => matchesLocalQuery(repo, searchQuery))
      : browseItemsRaw
    const source = projectFilter === 'all'
      ? tabSource
      : tabSource.filter(isStoreApplicationProject)

    if (installableFilter === 'all' && browseTab !== 'releases') return source

    return source.filter((repo) => installability[repoKey(repo)]?.installable)
  }, [browseItemsRaw, browseTab, favoriteRepos, installability, installableFilter, projectFilter, searchQuery])

  const loadingInstallability = useMemo(() => {
    if (installableFilter !== 'installable' && browseTab !== 'releases') return false
    return browseItemsRaw.some((repo) => {
      const status = installability[repoKey(repo)]
      return !status || status.checking
    })
  }, [browseItemsRaw, browseTab, installability, installableFilter])

  const refreshLocalState = useCallback(async () => {
    const [favorites, apps, art] = await Promise.all([
      getFavorites().catch(() => []),
      getInstalledApps().catch(() => []),
      listProjectArt().catch(() => []),
    ])

    setFavoriteKeys(new Set(favorites.map((item) => `${item.owner}/${item.repo}`.toLowerCase())))
    setFavoriteApps(favorites)
    setInstalledApps(apps)
    setProjectArt(Object.fromEntries(
      art.map((item) => [projectArtKey(item.owner, item.repo), item]),
    ))
  }, [])

  const loadBrowse = useCallback(async (page = 1, forceRefresh = false) => {
    const requestGeneration = page === 1
      ? ++browseRequestGeneration.current
      : browseRequestGeneration.current

    if (page === 1) {
      cancelQueuedGithubRequests(storeBrowseRequestGroup)
    }

    if (browseTab === 'favorites') {
      setBrowseItemsRaw([])
      setBrowsePage(1)
      setHasMoreBrowse(false)
      return
    }

    if (page === 1) {
      setBrowseItemsRaw([])
      setBrowsePage(1)
      setHasMoreBrowse(false)
    }
    setLoadingBrowse(true)
    setError(null)
    try {
      const options = browseOptions(browseTab, searchQuery)
      const result = await searchPublicRepositories(options.query ?? '', page, {
        sort: options.sort,
        language: options.language,
        topic: options.topic,
        releasesOnly: options.releasesOnly,
        forceRefresh,
        requestGroup: storeBrowseRequestGroup,
      })
      if (requestGeneration !== browseRequestGeneration.current) return
      const platformItems = filterReposForStorePlatform(result.items, currentPlatform)
      setBrowseItemsRaw((current) => page === 1 ? platformItems : [...current, ...platformItems])
      setBrowsePage(result.page)
      setHasMoreBrowse(result.has_more)
    } catch (error) {
      if (
        requestGeneration !== browseRequestGeneration.current
        || isGithubRequestCancelled(error)
      ) {
        return
      }
      if (page === 1) {
        setBrowseItemsRaw(platformFallbackRepos.filter((repo) => matchesLocalQuery(repo, searchQuery)))
        setBrowsePage(1)
        setHasMoreBrowse(false)
      }
      setError(classifyStoreError(error))
    } finally {
      if (requestGeneration === browseRequestGeneration.current) {
        setLoadingBrowse(false)
      }
    }
  }, [browseTab, currentPlatform, platformFallbackRepos, searchQuery])

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
      [key]: {
        checked: false,
        checking: true,
        installable: false,
      },
    }))

    try {
      const releases = await getReleases(repo.owner.login, repo.name)
      const release = pickLatestInstallableRelease(releases, runtime)
      const status = installabilityFromRelease(release, runtime)
      writeCachedInstallability(key, status)
      setInstallability((state) => ({ ...state, [key]: status }))
      return status
    } catch {
      const cachedFallback = readCachedInstallability(key, runtime, true)
      const status = cachedFallback ?? {
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

  const toggleFavorite = useCallback(async (repo: GitHubSearchResult) => {
    const key = repoKey(repo)
    const nextFavorite = !favoriteKeys.has(key)
    setFavoriteKeys((current) => {
      const next = new Set(current)
      if (nextFavorite) {
        next.add(key)
      } else {
        next.delete(key)
      }
      return next
    })

    try {
      if (nextFavorite) {
        await addToFavorites(repo.owner.login, repo.name, repo.name, repo.description ?? undefined)
      } else {
        await removeFromFavorites(repo.owner.login, repo.name)
      }
    } catch {
      setFavoriteKeys((current) => {
        const next = new Set(current)
        if (nextFavorite) {
          next.delete(key)
        } else {
          next.add(key)
        }
        return next
      })
    }
  }, [favoriteKeys])

  const refreshAll = useCallback(async () => {
    setInstallability({})
    await Promise.all([
      loadBrowse(1, true),
      refreshLocalState(),
    ])
  }, [loadBrowse, refreshLocalState])

  const loadMoreBrowse = useCallback(() => {
    if (loadingBrowse || !hasMoreBrowse || browseTab === 'favorites') return
    void loadBrowse(browsePage + 1)
  }, [browsePage, browseTab, hasMoreBrowse, loadBrowse, loadingBrowse])

  useEffect(() => {
    void refreshLocalState()
  }, [refreshLocalState])

  useEffect(() => {
    if (!remoteBrowsingEnabled) return
    void loadBrowse(1)
  }, [loadBrowse, remoteBrowsingEnabled])

  useEffect(() => {
    if (installableFilter !== 'installable' && browseTab !== 'releases') return
    browseItemsRaw.slice(0, installabilityAutoCheckLimit).forEach((repo) => {
      void checkInstallability(repo)
    })
  }, [browseItemsRaw, browseTab, checkInstallability, installableFilter])

  return {
    browseItems,
    browseTabs: storeBrowseTabs,
    checkInstallability,
    error,
    favoriteKeys,
    favoriteRepos,
    fallbackRepos: platformFallbackRepos,
    hasMoreBrowse,
    homeSections: visibleHomeSections,
    installability,
    installedByRepo,
    installedRepos,
    loadingBrowse,
    loadingInstallability,
    loadMoreBrowse,
    projectArt,
    projectFilter,
    personalized,
    refreshAll,
    refreshLocalState,
    toggleFavorite,
    runtime,
  }
}
