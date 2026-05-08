import { useEffect, useState } from 'react'
import type { GitHubSearchResult, InstalledApp } from '../../types'
import { addToFavorites, checkIsFavorite, removeFromFavorites } from '../../services/favorites'
import { useI18n } from '../../i18n'
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
  const { language, t } = useI18n()
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

  const handleSelect = (event: React.MouseEvent) => {
    event.stopPropagation()
    onSelect()
  }

  const updatedDate = new Date(repo.updated_at).toLocaleDateString(language === 'en' ? 'en-US' : 'uk-UA')
  const statusClass = hasUpdate ? 'update' : isInstalled ? 'installed' : 'available'
  const statusLabel = hasUpdate ? t('repo.update') : isInstalled ? t('repo.installed') : t('repo.available')
  const primaryLabel = hasUpdate ? t('repo.updateAction') : isInstalled ? t('repo.launch') : t('repo.install')
  const primaryAction = isInstalled && !hasUpdate ? handleLaunch : handleSelect

  return (
    <article className={`repo-card repo-card--${statusClass}`} onClick={onSelect}>
      <img
        src={repo.owner.avatar_url}
        alt={repo.owner.login}
        className="owner-avatar"
      />

      <div className="repo-info">
        <div className="repo-title-line">
          <h3 className="repo-name">{repo.name}</h3>
        </div>

        <div className="repo-owner">{repo.owner.login}/{repo.name}</div>

        {repo.description && (
          <p className="repo-description">{repo.description}</p>
        )}

        <div className="repo-meta">
          <span>{t('repo.stars', { count: repo.stargazers_count.toLocaleString() })}</span>
          {repo.language && (
            <span className="repo-lang">{repo.language}</span>
          )}
          {installedApp && (
            <span className="repo-installed-version">
              {t('repo.active', { version: installedApp.activeVersion })}
            </span>
          )}
          {hasUpdate && latestVersion && (
            <span className="repo-update-version">
              {t('repo.new', { version: latestVersion })}
            </span>
          )}
          <span>{t('repo.updated', { date: updatedDate })}</span>
        </div>
      </div>

      <div className="repo-card-actions">
        <span className={`repo-status ${statusClass}`}>
          {statusLabel}
        </span>
        <button
          type="button"
          className={`fav-btn ${isFav ? 'active' : ''}`}
          onClick={toggleFavorite}
          disabled={favLoading}
          title={isFav ? t('repo.removeFavorite') : t('repo.addFavorite')}
          aria-label={isFav ? t('repo.removeFavorite') : t('repo.addFavorite')}
        >
          {isFav ? '★' : '☆'}
        </button>
        {isInstalled && hasUpdate && (
          <button type="button" className="launch-btn" onClick={handleLaunch}>
            {t('repo.launch')}
          </button>
        )}
        {isInstalled && (
          <button type="button" className="secondary-btn versions-btn" onClick={handleSelect}>
            {t('repo.versions')}
          </button>
        )}
        <button type="button" className="install-btn" onClick={primaryAction}>
          {primaryLabel}
        </button>
      </div>
    </article>
  )
}

export default RepoCard
