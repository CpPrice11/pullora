import { useCallback, useMemo, useState } from 'react'
import { projectArtKey } from '../../../services/projectArt'
import type { FavoriteApp, GitHubSearchResult, InstalledApp } from '../../../types'
import { getLibraryAppStatus, getLibraryStatusRank, getUpdateDismissKey } from '../libraryStatus'

export type LibraryViewMode = 'home' | 'recent' | 'ready'
type LibraryFilter = 'all' | 'installed' | 'favorites' | 'updates' | 'available'
type LibrarySort = 'updated' | 'name' | 'status'

interface UseLibraryFilteringOptions {
  repositories: GitHubSearchResult[]
  favorites: FavoriteApp[]
  favoriteKeys: Set<string>
  dismissedUpdateKeys: Set<string>
  getInstalledApp: (repo: GitHubSearchResult) => InstalledApp | undefined
  getLatestVersion: (repo: GitHubSearchResult) => string | undefined
}

function isLauncherRepository(owner: string, repo: string) {
  return owner.trim().toLowerCase() === 'cpprice11' &&
    repo.trim().toLowerCase() === 'pullora'
}

function latestInstalledTimestamp(app: InstalledApp) {
  return app.versions.reduce(
    (latest, version) => Math.max(latest, new Date(version.installedAt).getTime()),
    0,
  )
}

export function useLibraryFiltering({
  repositories,
  favorites,
  favoriteKeys,
  dismissedUpdateKeys,
  getInstalledApp,
  getLatestVersion,
}: UseLibraryFilteringOptions) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<LibraryFilter>('all')
  const [sort, setSort] = useState<LibrarySort>('updated')
  const [viewMode, setViewMode] = useState<LibraryViewMode>('home')

  const resetFilters = useCallback(() => {
    setQuery('')
    setFilter('all')
    setSort('updated')
    setViewMode('home')
  }, [])

  const changeViewMode = useCallback((mode: LibraryViewMode) => {
    const ready = mode === 'ready'
    setViewMode(mode)
    setFilter(ready ? 'installed' : 'all')
    setSort(ready ? 'status' : 'updated')
  }, [])

  const favoritesByRepoKey = useMemo(() => new Map(
    favorites
      .filter((favorite) => !isLauncherRepository(favorite.owner, favorite.repo))
      .map((favorite) => [projectArtKey(favorite.owner, favorite.repo), favorite]),
  ), [favorites])

  const visibleRepositories = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const filtered = repositories.filter((repo) => {
      const installedApp = getInstalledApp(repo)
      const latestVersion = getLatestVersion(repo)
      const repoKey = projectArtKey(repo.owner.login, repo.name)
      const status = getLibraryAppStatus(installedApp, latestVersion)
      const updateDismissed = Boolean(
        latestVersion && dismissedUpdateKeys.has(
          getUpdateDismissKey(repo.owner.login, repo.name, latestVersion),
        ),
      )

      if (viewMode === 'ready' && status === 'available') return false
      if (filter === 'installed' && status === 'available') return false
      if (filter === 'favorites' && !favoriteKeys.has(repoKey)) return false
      if (filter === 'updates' && (status !== 'update' || updateDismissed)) return false
      if (filter === 'available' && status !== 'available') return false
      if (!normalizedQuery) return true

      return [
        repo.name,
        repo.full_name,
        repo.description ?? '',
        repo.language ?? '',
        ...(repo.topics ?? []),
      ].join(' ').toLowerCase().includes(normalizedQuery)
    })

    const activityTimestamp = (repo: GitHubSearchResult) => {
      const repoKey = projectArtKey(repo.owner.login, repo.name)
      const installedApp = getInstalledApp(repo)
      const favorite = favoritesByRepoKey.get(repoKey)
      return Math.max(
        new Date(repo.updated_at).getTime(),
        installedApp ? latestInstalledTimestamp(installedApp) : 0,
        favorite?.lastChecked ? new Date(favorite.lastChecked).getTime() : 0,
      )
    }

    return [...filtered].sort((a, b) => {
      if (viewMode === 'recent') {
        return activityTimestamp(b) - activityTimestamp(a) || a.name.localeCompare(b.name)
      }
      if (sort === 'name') return a.name.localeCompare(b.name)
      if (sort === 'status') {
        return getLibraryStatusRank(getLibraryAppStatus(getInstalledApp(a), getLatestVersion(a))) -
          getLibraryStatusRank(getLibraryAppStatus(getInstalledApp(b), getLatestVersion(b))) ||
          a.name.localeCompare(b.name)
      }

      const favoriteDifference = Number(!favoriteKeys.has(projectArtKey(a.owner.login, a.name))) -
        Number(!favoriteKeys.has(projectArtKey(b.owner.login, b.name)))
      if (favoriteDifference !== 0) return favoriteDifference
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    })
  }, [
    dismissedUpdateKeys,
    favoriteKeys,
    favoritesByRepoKey,
    filter,
    getInstalledApp,
    getLatestVersion,
    query,
    repositories,
    sort,
    viewMode,
  ])

  return {
    query,
    setQuery,
    filter,
    viewMode,
    visibleRepositories,
    resetFilters,
    changeViewMode,
  }
}
