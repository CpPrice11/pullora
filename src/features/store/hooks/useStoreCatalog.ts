import { useCallback, useEffect, useMemo, useState } from 'react'
import type { GitHubRelease, GitHubSearchResult, InstalledApp, ProjectArt } from '../../../types'
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
  type StoreBrowseTab,
  type StoreInstallableFilter,
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

function installedKey(app: InstalledApp) {
  return `${app.owner}/${app.repo}`.toLowerCase()
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
  const [installedApps, setInstalledApps] = useState<InstalledApp[]>([])
  const [projectArt, setProjectArt] = useState<Record<string, ProjectArt>>({})
  const [installability, setInstallability] = useState<Record<string, StoreInstallability>>({})

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
    setInstalledApps(apps)
    setProjectArt(Object.fromEntries(
      art.map((item) => [projectArtKey(item.owner, item.repo), item]),
    ))
  }, [])

  const loadHome = useCallback(async () => {
    setLoadingHome(true)
    setError(null)
    try {
      const sections = await Promise.all(storeHomeSections.map(async (section) => {
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
      setHomeSections(sections)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load store')
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
      setError(err instanceof Error ? err.message : 'Failed to load store catalog')
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
    homeSections,
    installability,
    installedByRepo,
    loadingBrowse,
    loadingHome,
    loadingInstallability,
    loadMoreBrowse,
    projectArt,
    refreshAll,
    refreshLocalState,
    toggleFavorite,
  }
}
