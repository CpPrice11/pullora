import { useCallback, useMemo, useState } from 'react'
import type { GitHubSearchResult, InstalledApp } from '../../../types'
import type { LibraryFilter, LibrarySort } from '../libraryViewControls'

interface UseLibraryFilteringOptions {
  repositories: GitHubSearchResult[]
  getInstalledApp: (repo: GitHubSearchResult) => InstalledApp | undefined
  initialQuery?: string
  initialFilter?: LibraryFilter
  initialSort?: LibrarySort
}

export function useLibraryFiltering({
  repositories,
  getInstalledApp,
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
      if (filter === 'installed' && (repo.website_url || !getInstalledApp(repo))) return false
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
    filter,
    getInstalledApp,
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
