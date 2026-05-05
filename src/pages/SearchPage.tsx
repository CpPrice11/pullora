import { useState } from 'react'
import { useGitHubSearch } from '../hooks/useGitHub'
import RepoCard from '../components/Search/RepoCard'
import ReleaseSelector from '../components/Search/ReleaseSelector'
import type { GitHubSearchResult } from '../types'
import './PageStyles.css'

function SearchPage() {
  const [input, setInput] = useState('')
  const { state, handleSearch, loadMore } = useGitHubSearch()
  const [selectedRepo, setSelectedRepo] = useState<GitHubSearchResult | null>(null)

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    handleSearch(input)
  }

  return (
    <div className="page">
      <h2>Search GitHub Repositories</h2>

      <form onSubmit={onSubmit} className="search-form">
        <input
          type="text"
          placeholder="Search for a repository (e.g., 'neovim', 'zig', 'helix')..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="search-input"
        />
        <button type="submit" disabled={state.loading}>
          {state.loading ? 'Searching...' : 'Search'}
        </button>
      </form>

      {state.error && (
        <div className="error-banner">⚠ {state.error}</div>
      )}

      {state.totalCount > 0 && (
        <p className="results-count">
          Found {state.totalCount.toLocaleString()} repositories
        </p>
      )}

      <div className="search-results">
        {state.results.length === 0 && !state.loading && (
          <div className="empty-state">
            <p>Search for a repository to get started</p>
          </div>
        )}

        {state.results.map((repo) => (
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
