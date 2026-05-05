import { useState, useEffect } from 'react'
import type { GitHubSearchResult } from '../../types'
import { checkIsFavorite, addToFavorites, removeFromFavorites } from '../../services/favorites'
import './SearchComponents.css'

interface RepoCardProps {
  repo: GitHubSearchResult
  onSelect: () => void
}

function RepoCard({ repo, onSelect }: RepoCardProps) {
  const [isFav, setIsFav] = useState(false)
  const [favLoading, setFavLoading] = useState(false)

  useEffect(() => {
    checkIsFavorite(repo.owner.login, repo.name)
      .then(setIsFav)
      .catch(() => {})
  }, [repo.owner.login, repo.name])

  const toggleFavorite = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setFavLoading(true)
    try {
      if (isFav) {
        await removeFromFavorites(repo.owner.login, repo.name)
        setIsFav(false)
      } else {
        await addToFavorites(
          repo.owner.login,
          repo.name,
          repo.name,
          repo.description ?? undefined,
        )
        setIsFav(true)
      }
    } catch {
      // silently ignore in browser preview
    } finally {
      setFavLoading(false)
    }
  }

  const updatedDate = new Date(repo.updated_at).toLocaleDateString()

  return (
    <div className="repo-card" onClick={onSelect}>
      <div className="repo-card-header">
        <div className="repo-title-row">
          <img
            src={repo.owner.avatar_url}
            alt={repo.owner.login}
            className="owner-avatar"
          />
          <div>
            <h3 className="repo-name">{repo.name}</h3>
            <span className="repo-owner">{repo.owner.login}</span>
          </div>
        </div>
        <button
          className={`fav-btn ${isFav ? 'active' : ''}`}
          onClick={toggleFavorite}
          disabled={favLoading}
          title={isFav ? 'Remove from favorites' : 'Add to favorites'}
        >
          {isFav ? '★' : '☆'}
        </button>
      </div>

      {repo.description && (
        <p className="repo-description">{repo.description}</p>
      )}

      <div className="repo-meta">
        <span className="repo-stars">⭐ {repo.stargazers_count.toLocaleString()}</span>
        {repo.language && (
          <span className="repo-lang">{repo.language}</span>
        )}
        <span className="repo-updated">Updated {updatedDate}</span>
      </div>

      <button className="install-btn" onClick={onSelect}>
        View Releases →
      </button>
    </div>
  )
}

export default RepoCard
