import { useEffect, useState } from 'react'
import type { GitHubSearchResult, InstalledApp, ProjectArt } from '../../types'
import { addToFavorites, checkIsFavorite, removeFromFavorites } from '../../services/favorites'
import { toProjectArtUrl } from '../../services/projectArt'
import { useI18n } from '../../i18n'
import './SearchComponents.css'

interface RepoCardProps {
  repo: GitHubSearchResult
  installedApp?: InstalledApp
  latestVersion?: string
  art?: ProjectArt
  isSelected?: boolean
  onPreview?: () => void
  onPickArt?: (kind: 'cover' | 'background') => void
  onSelect: () => void
  onLaunch?: () => void
}

function RepoCard({
  repo,
  installedApp,
  latestVersion,
  art,
  isSelected = false,
  onPreview,
  onPickArt,
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

  const handlePickArt = (event: React.MouseEvent, kind: 'cover' | 'background') => {
    event.stopPropagation()
    onPickArt?.(kind)
  }

  const handlePreview = () => {
    onPreview?.()
  }

  const updatedDate = new Date(repo.updated_at).toLocaleDateString(language === 'en' ? 'en-US' : 'uk-UA')
  const statusClass = hasUpdate ? 'update' : isInstalled ? 'installed' : 'available'
  const statusLabel = hasUpdate ? t('repo.update') : isInstalled ? t('repo.installed') : t('repo.available')
  const primaryLabel = hasUpdate ? t('repo.updateAction') : isInstalled ? t('repo.launch') : t('repo.install')
  const primaryAction = isInstalled && !hasUpdate ? handleLaunch : handleSelect

  const coverUrl = toProjectArtUrl(art?.coverPath)

  return (
    <article
      className={`repo-card repo-card--${statusClass} ${isSelected ? 'selected' : ''}`}
      onClick={handlePreview}
      tabIndex={0}
      role="button"
      aria-label={`${repo.name}, ${statusLabel}`}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          handlePreview()
        }
      }}
    >
      <div className="repo-card-media">
        <img
          src={coverUrl ?? repo.owner.avatar_url}
          alt=""
          className="owner-avatar"
        />
      </div>

      <div className="repo-info">
        <div className="repo-title-line">
          <h3 className="repo-name" title={repo.name}>{repo.name}</h3>
          <span className={`repo-status ${statusClass}`}>
            {statusLabel}
          </span>
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
        <button
          type="button"
          className={`fav-btn ${isFav ? 'active' : ''}`}
          onClick={toggleFavorite}
          disabled={favLoading}
          title={isFav ? t('repo.removeFavorite') : t('repo.addFavorite')}
          aria-label={isFav ? t('repo.removeFavorite') : t('repo.addFavorite')}
        >
          {isFav ? '\u2605' : '\u2606'}
        </button>
        {isInstalled && hasUpdate && (
          <button
            type="button"
            className="launch-btn"
            onClick={handleLaunch}
            aria-label={`${t('repo.launch')}: ${repo.name}`}
          >
            {t('repo.launch')}
          </button>
        )}
        {isInstalled && (
          <button
            type="button"
            className="secondary-btn versions-btn"
            onClick={handleSelect}
            aria-label={`${t('repo.versions')}: ${repo.name}`}
          >
            {t('repo.versions')}
          </button>
        )}
        {isSelected && onPickArt && (
          <>
            <button
              type="button"
              className="secondary-btn art-mini-btn"
              onClick={(event) => handlePickArt(event, 'background')}
            >
              {t('art.background')}
            </button>
            <button
              type="button"
              className="secondary-btn art-mini-btn"
              onClick={(event) => handlePickArt(event, 'cover')}
            >
              {t('art.cover')}
            </button>
          </>
        )}
        <button
          type="button"
          className="install-btn"
          onClick={primaryAction}
          aria-label={`${primaryLabel}: ${repo.name}`}
        >
          {primaryLabel}
        </button>
      </div>
    </article>
  )
}

export default RepoCard
