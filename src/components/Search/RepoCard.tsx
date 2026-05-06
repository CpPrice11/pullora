import { useEffect, useState } from 'react'
import type { GitHubSearchResult, InstalledApp } from '../../types'
import { checkIsFavorite, addToFavorites, removeFromFavorites } from '../../services/favorites'
import './SearchComponents.css'

interface RepoCardProps {
  repo: GitHubSearchResult
  installedApp?: InstalledApp
  latestVersion?: string
  onSelect: () => void
  onLaunch?: () => void
}

function RepoCard({
  repo,
  installedApp,
  latestVersion,
  onSelect,
  onLaunch,
}: RepoCardProps) {
  const [isFav, setIsFav] = useState(false)
  const [favLoading, setFavLoading] = useState(false)
  const isInstalled = Boolean(installedApp)
  const hasUpdate = Boolean(
    installedApp &&
    latestVersion &&
    latestVersion !== installedApp.activeVersion,
  )

  useEffect(() => {
    checkIsFavorite(repo.owner.login, repo.name)
      .then(setIsFav)
      .catch(() => {})
  }, [repo.owner.login, repo.name])

  const toggleFavorite = async (event: React.MouseEvent) => {
    event.stopPropagation()
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
      // Browser preview fallback.
    } finally {
      setFavLoading(false)
    }
  }

  const handleLaunch = (event: React.MouseEvent) => {
    event.stopPropagation()
    onLaunch?.()
  }

  const updatedDate = new Date(repo.updated_at).toLocaleDateString('uk-UA')
  const statusLabel = hasUpdate ? 'Оновлення' : isInstalled ? 'Встановлено' : 'Готово'
  const primaryLabel = hasUpdate ? 'Оновити' : isInstalled ? 'Версії' : 'Встановити'

  return (
    <article className="repo-card" onClick={onSelect}>
      <div className="repo-card-main">
        <div className="repo-card-identity">
          <img
            src={repo.owner.avatar_url}
            alt={repo.owner.login}
            className="owner-avatar"
          />
          <div className="repo-title-block">
            <div className="repo-name-row">
              <h3 className="repo-name">{repo.name}</h3>
              <span className={`repo-status ${hasUpdate ? 'update' : isInstalled ? 'installed' : ''}`}>
                {statusLabel}
              </span>
            </div>
            <span className="repo-owner">{repo.owner.login}</span>
          </div>
        </div>

        <div className="repo-card-content">
          {repo.description && (
            <p className="repo-description">{repo.description}</p>
          )}

          <div className="repo-meta">
            <span>{repo.stargazers_count.toLocaleString()} зірок</span>
            {repo.language && (
              <span className="repo-lang">{repo.language}</span>
            )}
            {installedApp && (
              <span className="repo-installed-version">
                Активна {installedApp.activeVersion}
              </span>
            )}
            {hasUpdate && latestVersion && (
              <span className="repo-update-version">
                Нова {latestVersion}
              </span>
            )}
            <span>Оновлено {updatedDate}</span>
          </div>
        </div>
      </div>

      <div className="repo-card-actions">
        <button
          className={`fav-btn ${isFav ? 'active' : ''}`}
          onClick={toggleFavorite}
          disabled={favLoading}
          title={isFav ? 'Прибрати з обраного' : 'Додати в обране'}
          aria-label={isFav ? 'Прибрати з обраного' : 'Додати в обране'}
        >
          {isFav ? '★' : '☆'}
        </button>
        {isInstalled && (
          <button className="launch-btn" onClick={handleLaunch}>
            Запустити
          </button>
        )}
        <button className="install-btn" onClick={onSelect}>
          {primaryLabel}
        </button>
      </div>
    </article>
  )
}

export default RepoCard
