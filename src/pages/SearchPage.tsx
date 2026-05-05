import { useEffect, useMemo, useState } from 'react'
import { useOwnerRepositories } from '../hooks/useGitHub'
import { useSettings } from '../hooks/useSettings'
import RepoCard from '../components/Search/RepoCard'
import ReleaseSelector from '../components/Search/ReleaseSelector'
import type { GitHubSearchResult } from '../types'
import './PageStyles.css'

function SearchPage() {
  const [query, setQuery] = useState('')
  const [selectedRepo, setSelectedRepo] = useState<GitHubSearchResult | null>(null)
  const { settings, loading: settingsLoading } = useSettings()
  const owner = settings.githubOwner?.trim()
  const { state, loadRepositories, loadMore } = useOwnerRepositories(owner)

  useEffect(() => {
    if (!settingsLoading) {
      loadRepositories(1)
    }
  }, [settingsLoading, loadRepositories])

  const visibleRepositories = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return state.repositories

    return state.repositories.filter((repo) => {
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
  }, [query, state.repositories])

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

          {state.error && (
            <div className="error-banner">Warning: {state.error}</div>
          )}

          <p className="results-count">
            {state.repositories.length.toLocaleString()} release-ready repositories
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
                onSelect={() => setSelectedRepo(repo)}
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
        />
      )}
    </div>
  )
}

export default SearchPage
