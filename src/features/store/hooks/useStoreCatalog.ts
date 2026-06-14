import { useCallback, useEffect, useMemo, useState } from 'react'
import { platform as getPlatform, type Platform } from '@tauri-apps/plugin-os'
import type { FavoriteApp, GitHubRelease, GitHubSearchResult, InstalledApp, ProjectArt } from '../../../types'
import { getReleases, searchPublicRepositories } from '../../../services/github'
import { addToFavorites, getFavorites, removeFromFavorites } from '../../../services/favorites'
import { getInstalledApps } from '../../../services/installed'
import { listProjectArt, projectArtKey } from '../../../services/projectArt'
import {
  browseOptions,
  fallbackStoreRepos,
  filterReposForStorePlatform,
  matchesLocalQuery,
  repoKey,
  storeBrowseTabs,
  storeHomeSections,
  uniqueRepos,
  type StoreBrowseTab,
  type StoreInstallableFilter,
  type StorePlatform,
} from '../storeCatalog'

export interface StoreInstallability {
  checked: boolean
  checking: boolean
  installable: boolean
  latestTag?: string | null
}

export interface StoreSection {
  id: string
  titleKey: string
  subtitleKey: string
  items: GitHubSearchResult[]
}

interface LibraryRepoRef {
  owner: string
  repo: string
  description?: string
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

function pickLatestInstallableRelease(releases: GitHubRelease[]) {
  return releases.find((release) =>
    !release.draft &&
    !release.prerelease &&
    release.assets.length > 0,
  ) ?? releases.find((release) =>
    !release.draft &&
    release.assets.length > 0,
  ) ?? null
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
) {
  const [homeSections, setHomeSections] = useState<StoreSection[]>([])
  const [browseItemsRaw, setBrowseItemsRaw] = useState<GitHubSearchResult[]>([])
  const [browsePage, setBrowsePage] = useState(1)
  const [hasMoreBrowse, setHasMoreBrowse] = useState(false)
  const [loadingHome, setLoadingHome] = useState(false)
  const [loadingBrowse, setLoadingBrowse] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [favoriteKeys, setFavoriteKeys] = useState<Set<string>>(new Set())
  const [favoriteApps, setFavoriteApps] = useState<FavoriteApp[]>([])
  const [installedApps, setInstalledApps] = useState<InstalledApp[]>([])
  const [projectArt, setProjectArt] = useState<Record<string, ProjectArt>>({})
  const [installability, setInstallability] = useState<Record<string, StoreInstallability>>({})
  const [currentPlatform] = useState<StorePlatform>(() => readCurrentPlatform())

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

    return candidates
      .map((repo) => ({ repo, score: scorePersonalizedRepo(repo, libraryRefs) }))
      .sort((left, right) => right.score - left.score || right.repo.stargazers_count - left.repo.stargazers_count)
      .slice(0, 12)
      .map((item) => item.repo)
  }, [browseItemsRaw, currentPlatform, homeSections, libraryKeys, libraryRefs, platformFallbackRepos])

  const personalized = personalizedItems.length > 0

  const visibleHomeSections = useMemo(() => {
    if (personalizedItems.length === 0) return homeSections

    const recommended = {
      id: 'personalized',
      titleKey: 'store.section.recommended',
      subtitleKey: 'store.section.personalizedText',
      items: personalizedItems,
    }
    const rest = homeSections.filter((section) => section.id !== 'recommended')
    return [recommended, ...rest]
  }, [homeSections, personalizedItems])

  const installedByRepo = useMemo(() => {
    return new Map(installedApps.map((app) => [installedKey(app), app]))
  }, [installedApps])

  const knownRepos = useMemo(() => {
    const repos = new Map<string, GitHubSearchResult>()
    visibleHomeSections.forEach((section) => {
      section.items.forEach((repo) => repos.set(repoKey(repo), repo))
    })
    browseItemsRaw.forEach((repo) => repos.set(repoKey(repo), repo))
    return [...repos.values()]
  }, [browseItemsRaw, visibleHomeSections])

  const favoriteRepos = useMemo(() => {
    return knownRepos.filter((repo) => favoriteKeys.has(repoKey(repo)))
  }, [favoriteKeys, knownRepos])

  const browseItems = useMemo(() => {
    const source = browseTab === 'favorites'
      ? favoriteRepos.filter((repo) => matchesLocalQuery(repo, searchQuery))
      : browseItemsRaw

    if (installableFilter === 'all') return source

    return source.filter((repo) => installability[repoKey(repo)]?.installable)
  }, [browseItemsRaw, browseTab, favoriteRepos, installability, installableFilter, searchQuery])

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

  const loadHome = useCallback(async () => {
    setLoadingHome(true)
    setError(null)
    try {
      const settled = await Promise.allSettled(storeHomeSections.map(async (section) => {
        const result = await searchPublicRepositories(section.options.query ?? '', 1, {
          sort: section.options.sort,
          language: section.options.language,
          topic: section.options.topic,
        })
        return {
          id: section.id,
          titleKey: section.titleKey,
          subtitleKey: section.subtitleKey,
          items: filterReposForStorePlatform(result.items, currentPlatform).slice(0, 12),
        }
      }))
      const sections = settled
        .filter((item): item is PromiseFulfilledResult<StoreSection> => item.status === 'fulfilled')
        .map((item) => item.value)
      setHomeSections(sections.length > 0 ? sections : fallbackHomeSections(currentPlatform))
      if (sections.length === 0 && settled.some((item) => item.status === 'rejected')) {
        setError(null)
      }
    } catch {
      setHomeSections(fallbackHomeSections(currentPlatform))
      setError(null)
    } finally {
      setLoadingHome(false)
    }
  }, [currentPlatform])

  const loadBrowse = useCallback(async (page = 1) => {
    if (browseTab === 'favorites') {
      setBrowseItemsRaw([])
      setBrowsePage(1)
      setHasMoreBrowse(false)
      return
    }

    setLoadingBrowse(true)
    setError(null)
    try {
      const options = browseOptions(browseTab, searchQuery)
      const result = await searchPublicRepositories(options.query ?? '', page, {
        sort: options.sort,
        language: options.language,
        topic: options.topic,
      })
      const platformItems = filterReposForStorePlatform(result.items, currentPlatform)
      setBrowseItemsRaw((current) => page === 1 ? platformItems : [...current, ...platformItems])
      setBrowsePage(result.page)
      setHasMoreBrowse(result.has_more)
    } catch {
      if (page === 1) {
        setBrowseItemsRaw(platformFallbackRepos.filter((repo) => matchesLocalQuery(repo, searchQuery)))
        setBrowsePage(1)
        setHasMoreBrowse(false)
      }
      setError(null)
    } finally {
      setLoadingBrowse(false)
    }
  }, [browseTab, currentPlatform, platformFallbackRepos, searchQuery])

  const checkInstallability = useCallback(async (repo: GitHubSearchResult) => {
    const key = repoKey(repo)
    const current = installability[key]
    if (current?.checking || current?.checked) return current

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
      const release = pickLatestInstallableRelease(releases)
      const status = {
        checked: true,
        checking: false,
        installable: Boolean(release),
        latestTag: release?.tag_name ?? null,
      }
      setInstallability((state) => ({ ...state, [key]: status }))
      return status
    } catch {
      const status = {
        checked: true,
        checking: false,
        installable: false,
        latestTag: null,
      }
      setInstallability((state) => ({ ...state, [key]: status }))
      return status
    }
  }, [installability])

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
    await Promise.all([
      loadHome(),
      loadBrowse(1),
      refreshLocalState(),
    ])
  }, [loadBrowse, loadHome, refreshLocalState])

  const loadMoreBrowse = useCallback(() => {
    if (loadingBrowse || !hasMoreBrowse || browseTab === 'favorites') return
    void loadBrowse(browsePage + 1)
  }, [browsePage, browseTab, hasMoreBrowse, loadBrowse, loadingBrowse])

  useEffect(() => {
    void refreshLocalState()
    void loadHome()
  }, [loadHome, refreshLocalState])

  useEffect(() => {
    void loadBrowse(1)
  }, [loadBrowse])

  useEffect(() => {
    if (installableFilter !== 'installable' && browseTab !== 'releases') return
    browseItemsRaw.slice(0, 18).forEach((repo) => {
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
    loadingBrowse,
    loadingHome,
    loadingInstallability,
    loadMoreBrowse,
    projectArt,
    personalized,
    refreshAll,
    refreshLocalState,
    toggleFavorite,
  }
}
