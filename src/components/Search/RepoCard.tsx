import { useEffect, useState } from 'react'
import type { GitHubSearchResult, InstalledApp } from '../../types'
import { checkIsFavorite, addToFavorites, removeFromFavorites } from '../../services/favorites'
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

  const updatedDate = new Date(repo.updated_at).toLocaleDateString(language === 'en' ? 'en-US' : 'uk-UA')
  const statusLabel = hasUpdate ? t('repo.update') : isInstalled ? t('repo.installed') : t('repo.ready')
  const primaryLabel = hasUpdate ? t('repo.updateAction') : isInstalled ? t('repo.versions') : t('repo.install')

  return (
    <article className="repo-card" onClick={onSelect}>
      <img
        src={repo.owner.avatar_url}
        alt={repo.owner.login}
        className="owner-avatar"
      />

      <div className="repo-info">
        <div className="repo-title-line">
          <h3 className="repo-name">{repo.name}</h3>
          <span className={`repo-status ${hasUpdate ? 'update' : isInstalled ? 'installed' : ''}`}>
            {statusLabel}
          </span>
        </div>

        <div className="repo-owner">{repo.owner.login}</div>

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
        <button
          className={`fav-btn ${isFav ? 'active' : ''}`}
          onClick={toggleFavorite}
          disabled={favLoading}
          title={isFav ? t('repo.removeFavorite') : t('repo.addFavorite')}
          aria-label={isFav ? t('repo.removeFavorite') : t('repo.addFavorite')}
        >
          {isFav ? '★' : '☆'}
        </button>
        {isInstalled && (
          <button className="launch-btn" onClick={handleLaunch}>
            {t('repo.launch')}
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
