import { useCallback, useMemo, useState } from 'react'
import { projectArtKey } from '../../../services/projectArt'
import type { GitHubSearchResult, InstalledApp } from '../../../types'
import { getLibraryAppStatus, getUpdateDismissKey } from '../libraryStatus'
import type { LibraryFilter, LibrarySort } from '../libraryViewControls'

interface UseLibraryFilteringOptions {
  repositories: GitHubSearchResult[]
  favoriteKeys: Set<string>
  dismissedUpdateKeys: Set<string>
  getInstalledApp: (repo: GitHubSearchResult) => InstalledApp | undefined
  getLatestVersion: (repo: GitHubSearchResult) => string | undefined
  initialQuery?: string
  initialFilter?: LibraryFilter
  initialSort?: LibrarySort
}

export function useLibraryFiltering({
  repositories,
  favoriteKeys,
  dismissedUpdateKeys,
  getInstalledApp,
  getLatestVersion,
  initialQuery = '',
  initialFilter = 'all',
  initialSort = 'updated',
}: UseLibraryFilteringOptions) {
  const [query, setQuery] = useState(initialQuery)
  const [filter, setFilter] = useState<LibraryFilter>(initialFilter)
  const [sort, setSort] = useState<LibrarySort>(initialSort)

  const resetFilters = useCallback(() => {
    setQuery('')
    setFilter('all')
    setSort('updated')
  }, [])

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

      if (filter === 'installed' && status === 'available') return false
      if (filter === 'favorites' && !favoriteKeys.has(repoKey)) return false
      if (filter === 'updates' && (status !== 'update' || updateDismissed)) return false
      if (!normalizedQuery) return true

      return [
        repo.name,
        repo.full_name,
        repo.description ?? '',
        repo.language ?? '',
        ...(repo.topics ?? []),
      ].join(' ').toLowerCase().includes(normalizedQuery)
    })

    return sortLibraryRepositories(filtered, sort, getInstalledApp)
  }, [
    dismissedUpdateKeys,
    favoriteKeys,
    filter,
    getInstalledApp,
    getLatestVersion,
    query,
    repositories,
    sort,
  ])

  return {
    query,
    setQuery,
    filter,
    sort,
    visibleRepositories,
    resetFilters,
    changeFilter: setFilter,
    changeSort: setSort,
  }
}

function timestamp(value?: string | null) {
  return value ? Date.parse(value) || 0 : 0
}

function latestInstalledTimestamp(app?: InstalledApp) {
  return app?.versions.reduce(
    (latest, version) => Math.max(latest, timestamp(version.installedAt)),
    0,
  ) ?? 0
}

export function sortLibraryRepositories(
  repositories: GitHubSearchResult[],
  sort: LibrarySort,
  getInstalledApp: (repo: GitHubSearchResult) => InstalledApp | undefined,
) {
  const value = (repo: GitHubSearchResult) => {
    const installedApp = getInstalledApp(repo)
    if (sort === 'launched') return timestamp(installedApp?.lastLaunchedAt)
    if (sort === 'installed') return latestInstalledTimestamp(installedApp)
    return timestamp(repo.updated_at)
  }

  return [...repositories].sort((a, b) => sort === 'name'
    ? a.name.localeCompare(b.name)
    : value(b) - value(a) || a.name.localeCompare(b.name))
}
