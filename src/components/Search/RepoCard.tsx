import { useEffect, useRef, useState } from 'react'
import type { GitHubSearchResult, InstalledApp, ProjectArt } from '../../types'
import { addToFavorites, checkIsFavorite, removeFromFavorites } from '../../services/favorites'
import { projectArtCoverUrl } from '../../services/projectArt'
import { useI18n } from '../../i18n'
import './SearchComponents.css'

interface RepoCardProps {
  repo: GitHubSearchResult
  installedApp?: InstalledApp
  latestVersion?: string
  art?: ProjectArt
  isFavorite?: boolean
  isSelected?: boolean
  onPreview?: () => void
  onFavoriteChange?: (isFavorite: boolean) => void
  onPickArt?: () => void
  onClearArt?: () => void
  onDetails?: () => void
  onUninstall?: () => void
  onSelect: () => void
  onLaunch?: () => void
}

function RepoCard({
  repo,
  installedApp,
  latestVersion,
  art,
  isFavorite,
  isSelected = false,
  onPreview,
  onFavoriteChange,
  onPickArt,
  onClearArt,
  onDetails,
  onUninstall,
  onSelect,
  onLaunch,
}: RepoCardProps) {
  const { language, t } = useI18n()
  const [isFav, setIsFav] = useState(false)
  const [favLoading, setFavLoading] = useState(false)
  const [actionsOpen, setActionsOpen] = useState(false)
  const actionsRef = useRef<HTMLDivElement | null>(null)
  const isInstalled = Boolean(installedApp)
  const hasUpdate = Boolean(
    installedApp &&
    latestVersion &&
    latestVersion !== installedApp.activeVersion,
  )

  useEffect(() => {
    if (typeof isFavorite === 'boolean') {
      setIsFav(isFavorite)
      return
    }

    checkIsFavorite(repo.owner.login, repo.name)
      .then(setIsFav)
      .catch(() => {})
  }, [isFavorite, repo.owner.login, repo.name])

  useEffect(() => {
    if (!actionsOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!actionsRef.current?.contains(event.target as Node)) {
        setActionsOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActionsOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [actionsOpen])

  const toggleFavorite = async (event: React.MouseEvent) => {
    event.stopPropagation()
    setFavLoading(true)
    try {
      if (isFav) {
        await removeFromFavorites(repo.owner.login, repo.name)
        setIsFav(false)
        onFavoriteChange?.(false)
      } else {
        await addToFavorites(
          repo.owner.login,
          repo.name,
          repo.name,
          repo.description ?? undefined,
        )
        setIsFav(true)
        onFavoriteChange?.(true)
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

  const handlePickArt = (event: React.MouseEvent) => {
    event.stopPropagation()
    setActionsOpen(false)
    onPickArt?.()
  }

  const handleClearArt = (event: React.MouseEvent) => {
    event.stopPropagation()
    setActionsOpen(false)
    onClearArt?.()
  }

  const handleDetails = (event: React.MouseEvent) => {
    event.stopPropagation()
    setActionsOpen(false)
    onDetails?.()
  }

  const handleUninstall = (event: React.MouseEvent) => {
    event.stopPropagation()
    setActionsOpen(false)
    onUninstall?.()
  }

  const handleActionsToggle = (event: React.MouseEvent) => {
    event.stopPropagation()
    setActionsOpen((current) => !current)
  }

  const handlePreview = () => {
    onPreview?.()
  }

  const updatedDate = new Date(repo.updated_at).toLocaleDateString(language === 'en' ? 'en-US' : 'uk-UA')
  const statusClass = hasUpdate ? 'update' : isInstalled ? 'installed' : 'available'
  const statusLabel = hasUpdate ? t('repo.update') : isInstalled ? t('repo.installed') : t('repo.available')
  const primaryLabel = hasUpdate ? t('repo.updateAction') : isInstalled ? t('repo.launch') : t('repo.install')
  const primaryAction = isInstalled && !hasUpdate ? handleLaunch : handleSelect

  const coverUrl = projectArtCoverUrl(art)

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
        {onPickArt && (
          <div
            className={`project-actions-menu repo-actions-menu ${actionsOpen ? 'open' : ''}`}
            ref={actionsRef}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="project-actions-trigger"
              aria-haspopup="menu"
              aria-expanded={actionsOpen}
              aria-label={t('projectActions.open')}
              onClick={handleActionsToggle}
            >
              ...
            </button>
            {actionsOpen && (
              <div className="project-actions-popover" role="menu" aria-label={t(isInstalled ? 'installed.moreActions' : 'art.actions')}>
                {isInstalled && onDetails && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleDetails}
                  >
                    {t('details.open')}
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={handlePickArt}
                >
                  {t('art.changeCover')}
                </button>
                {art?.coverPath && onClearArt && (
                  <button type="button" role="menuitem" onClick={handleClearArt}>
                    {t('art.resetCover')}
                  </button>
                )}
                {isInstalled && onUninstall && (
                  <button
                    type="button"
                    role="menuitem"
                    className="danger-menu-item"
                    onClick={handleUninstall}
                  >
                    {t('installed.uninstallApp')}
                  </button>
                )}
              </div>
            )}
          </div>
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
