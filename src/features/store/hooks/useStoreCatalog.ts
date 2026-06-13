import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FavoriteApp, GitHubRelease, GitHubSearchResult, InstalledApp, ProjectArt } from '../../../types'
import { getReleases, searchPublicRepositories } from '../../../services/github'
import { addToFavorites, getFavorites, removeFromFavorites } from '../../../services/favorites'
import { getInstalledApps } from '../../../services/installed'
import { listProjectArt, projectArtKey } from '../../../services/projectArt'
import {
  browseOptions,
  matchesLocalQuery,
  repoKey,
  storeBrowseTabs,
  storeHomeSections,
  uniqueRepos,
  type StoreBrowseTab,
  type StoreInstallableFilter,
  type StoreQueryOptions,
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

function incrementScore(scores: Map<string, number>, value?: string | null, weight = 1) {
  const normalized = value?.trim().toLowerCase()
  if (!normalized) return
  scores.set(normalized, (scores.get(normalized) ?? 0) + weight)
}

function topScores(scores: Map<string, number>, limit: number) {
  return [...scores.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([value]) => value)
}

function inferBroadTopics(repo: GitHubSearchResult) {
  const text = [
    repo.name,
    repo.full_name,
    repo.description ?? '',
    ...(repo.topics ?? []),
  ].join(' ').toLowerCase()
  const topics: string[] = []

  if (/\b(ai|llm|gpt|openai|chatbot|agent)\b/.test(text)) topics.push('ai')
  if (/\b(game|gaming|game-engine|unity|unreal)\b/.test(text)) topics.push('game')
  if (/\b(desktop|electron|tauri|native-app|windows-app)\b/.test(text)) topics.push('desktop-application')
  if (/\b(tool|cli|utility|productivity|developer-tool|devtool)\b/.test(text)) topics.push('tool')

  return topics
}

function buildRecommendationQueries(profileRepos: GitHubSearchResult[]): StoreQueryOptions[] {
  const languages = new Map<string, number>()
  const topics = new Map<string, number>()

  profileRepos.forEach((repo) => {
    incrementScore(languages, repo.language, 3)
    repo.topics?.forEach((topic) => incrementScore(topics, topic, 2))
    inferBroadTopics(repo).forEach((topic) => incrementScore(topics, topic, 3))
  })

  const topicQueries = topScores(topics, 3).map((topic) => ({
    sort: 'stars' as const,
    topic,
  }))
  const languageQueries = topScores(languages, 3).map((language) => ({
    sort: 'stars' as const,
    language,
  }))

  return [...topicQueries, ...languageQueries].slice(0, 5)
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
  const [personalizedItems, setPersonalizedItems] = useState<GitHubSearchResult[]>([])
  const [projectArt, setProjectArt] = useState<Record<string, ProjectArt>>({})
  const [installability, setInstallability] = useState<Record<string, StoreInstallability>>({})

  const libraryKeys = useMemo(() => {
    return new Set([
      ...installedApps.map(installedKey),
      ...favoriteApps.map(favoriteKey),
    ])
  }, [favoriteApps, installedApps])

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

  const loadPersonalizedRecommendations = useCallback(async () => {
    const seenRefs = new Set<string>()
    const refs = [
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

    if (refs.length === 0) {
      setPersonalizedItems([])
      return
    }

    try {
      const profileSettled = await Promise.allSettled(refs.slice(0, 8).map(async (ref) => {
        let result
        try {
          result = await searchPublicRepositories(`repo:${ref.owner}/${ref.repo}`, 1, { sort: 'stars' })
        } catch {
          result = await searchPublicRepositories(`${ref.owner} ${ref.repo}`, 1, { sort: 'stars' })
        }
        return result.items.find((repo) => repoKey(repo) === refKey(ref)) ?? result.items[0]
      }))
      const profileRepos = profileSettled
        .flatMap((item) => item.status === 'fulfilled' && item.value ? [item.value] : [])

      const queries = buildRecommendationQueries(profileRepos)
      if (queries.length === 0) {
        setPersonalizedItems([])
        return
      }

      const settled = await Promise.allSettled(queries.map(async (options) => {
        const result = await searchPublicRepositories('', 1, options)
        return result.items
      }))
      const candidates = uniqueRepos(settled
        .filter((item): item is PromiseFulfilledResult<GitHubSearchResult[]> => item.status === 'fulfilled')
        .flatMap((item) => item.value)
        .filter((repo) => !libraryKeys.has(repoKey(repo))))

      setPersonalizedItems(candidates.slice(0, 12))
    } catch {
      setPersonalizedItems([])
    }
  }, [favoriteApps, installedApps, libraryKeys])

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
          items: result.items.slice(0, 12),
        }
      }))
      const sections = settled
        .filter((item): item is PromiseFulfilledResult<StoreSection> => item.status === 'fulfilled')
        .map((item) => item.value)
      setHomeSections(sections)
      if (sections.length === 0 && settled.some((item) => item.status === 'rejected')) {
        setError('store.error.load')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'store.error.load')
    } finally {
      setLoadingHome(false)
    }
  }, [])

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
      setBrowseItemsRaw((current) => page === 1 ? result.items : [...current, ...result.items])
      setBrowsePage(result.page)
      setHasMoreBrowse(result.has_more)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'store.error.load')
    } finally {
      setLoadingBrowse(false)
    }
  }, [browseTab, searchQuery])

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
    void loadPersonalizedRecommendations()
  }, [loadPersonalizedRecommendations])

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
