import { useEffect, useMemo, useState } from 'react'
import { useOwnerRepositories } from '../hooks/useGitHub'
import { useSettings } from '../hooks/useSettings'
import { useLibraryStatus } from '../hooks/useLibraryStatus'
import RepoCard from '../components/Search/RepoCard'
import ReleaseSelector from '../components/Search/ReleaseSelector'
import { launchApp } from '../services/installed'
import type { GitHubSearchResult } from '../types'
import './PageStyles.css'

type LibraryFilter = 'all' | 'installed' | 'updates' | 'available'
type LibrarySort = 'updated' | 'name' | 'status'

function SearchPage() {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<LibraryFilter>('all')
  const [sort, setSort] = useState<LibrarySort>('updated')
  const [selectedRepo, setSelectedRepo] = useState<GitHubSearchResult | null>(null)
  const [launchError, setLaunchError] = useState<string | null>(null)
  const { settings, loading: settingsLoading } = useSettings()
  const owner = settings.githubOwner?.trim()
  const { state, loadRepositories, loadMore } = useOwnerRepositories(owner)
  const {
    checkingUpdates,
    getInstalledApp,
    getLatestVersion,
    refreshInstalledApps,
  } = useLibraryStatus(state.repositories)

  useEffect(() => {
    if (!settingsLoading) {
      loadRepositories(1)
    }
  }, [settingsLoading, loadRepositories])

  const visibleRepositories = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    const filtered = state.repositories.filter((repo) => {
      const installedApp = getInstalledApp(repo)
      const latestVersion = getLatestVersion(repo)
      const hasUpdate = Boolean(
        installedApp &&
        latestVersion &&
        latestVersion !== installedApp.activeVersion,
      )

      if (filter === 'installed' && !installedApp) return false
      if (filter === 'updates' && !hasUpdate) return false
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

      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    })
  }, [filter, getInstalledApp, getLatestVersion, query, sort, state.repositories])

  const handleLaunch = async (repo: GitHubSearchResult) => {
    setLaunchError(null)
    try {
      await launchApp(repo.owner.login, repo.name)
    } catch (err) {
      setLaunchError(err instanceof Error ? err.message : 'Failed to launch app')
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Library</h2>
          {owner && (
            <p className="page-subtitle">
              Public GitHub repositories from {owner} with releases
            </p>
          )}
        </div>
        {owner && (
          <button
            type="button"
            className="refresh-btn"
            onClick={() => loadRepositories(1)}
            disabled={state.loading}
          >
            {state.loading ? 'Refreshing...' : 'Refresh'}
          </button>
        )}
      </div>

      {!owner && !settingsLoading && (
        <div className="empty-state">
          <p>Set your GitHub owner in Settings to load your public repositories.</p>
        </div>
      )}

      {owner && (
        <>
          <div className="search-form">
            <input
              type="text"
              placeholder="Filter your library..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="search-input"
            />
          </div>

          <div className="library-controls">
            <div className="segmented-control" aria-label="Library filter">
              {(['all', 'installed', 'updates', 'available'] as LibraryFilter[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  className={filter === item ? 'active' : ''}
                  onClick={() => setFilter(item)}
                >
                  {item === 'all'
                    ? 'All'
                    : item === 'installed'
                      ? 'Installed'
                      : item === 'updates'
                        ? 'Updates'
                        : 'Available'}
                </button>
              ))}
            </div>

            <label className="sort-control">
              Sort
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as LibrarySort)}
              >
                <option value="updated">Recently updated</option>
                <option value="status">Status</option>
                <option value="name">Name</option>
              </select>
            </label>
          </div>

          {state.error && (
            <div className="error-banner">Warning: {state.error}</div>
          )}

          {launchError && (
            <div className="error-banner">Warning: {launchError}</div>
          )}

          <p className="results-count">
            {visibleRepositories.length.toLocaleString()} of{' '}
            {state.repositories.length.toLocaleString()} release-ready repositories
            {checkingUpdates ? ' - checking installed versions...' : ''}
          </p>

          <div className="search-results">
            {visibleRepositories.length === 0 && !state.loading && (
              <div className="empty-state">
                <p>
                  {state.repositories.length === 0
                    ? 'No public repositories with releases were found.'
                    : 'No repositories match this filter.'}
                </p>
              </div>
            )}

            {visibleRepositories.map((repo) => (
              <RepoCard
                key={repo.id}
                repo={repo}
                installedApp={getInstalledApp(repo)}
                latestVersion={getLatestVersion(repo)}
                onSelect={() => setSelectedRepo(repo)}
                onLaunch={() => handleLaunch(repo)}
              />
            ))}
          </div>

          {state.hasMore && !state.loading && (
            <button onClick={loadMore} className="load-more-btn">
              Load More
            </button>
          )}
        </>
      )}

      {selectedRepo && (
        <ReleaseSelector
          owner={selectedRepo.owner.login}
          repo={selectedRepo.name}
          displayName={selectedRepo.name}
          description={selectedRepo.description ?? undefined}
          onClose={() => setSelectedRepo(null)}
          onInstalled={refreshInstalledApps}
        />
      )}
    </div>
  )
}

export default SearchPage
