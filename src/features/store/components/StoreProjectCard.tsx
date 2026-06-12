import { useEffect, useState, type CSSProperties } from 'react'
import type { GitHubSearchResult, InstalledApp, ProjectArt } from '../../../types'
import { projectArtCoverUrl } from '../../../services/projectArt'
import { languageAccent, repoKey, socialPreviewUrl } from '../storeCatalog'
import type { StoreInstallability } from '../hooks/useStoreCatalog'
import { useI18n } from '../../../i18n'

interface StoreProjectCardProps {
  repo: GitHubSearchResult
  art?: ProjectArt
  installedApp?: InstalledApp
  installability?: StoreInstallability
  favorite?: boolean
  selected?: boolean
  variant?: 'feature' | 'tile' | 'row'
  onSelect?: (repo: GitHubSearchResult) => void
  onFavorite?: (repo: GitHubSearchResult) => void
  onInstall?: (repo: GitHubSearchResult) => void
  onOpenSource?: (repo: GitHubSearchResult) => void
}

function StoreProjectCard({
  repo,
  art,
  installedApp,
  installability,
  favorite = false,
  selected = false,
  variant = 'tile',
  onSelect,
  onFavorite,
  onInstall,
  onOpenSource,
}: StoreProjectCardProps) {
  const { language, t } = useI18n()
  const fallbackCover = projectArtCoverUrl(art) ?? repo.owner.avatar_url
  const [imageUrl, setImageUrl] = useState(socialPreviewUrl(repo))
  const updatedDate = new Date(repo.updated_at).toLocaleDateString(language === 'en' ? 'en-US' : 'uk-UA')
  const accent = languageAccent(repo.language)
  const isInstallable = Boolean(installability?.installable)
  const isChecking = Boolean(installability?.checking)
  const statusKey = installedApp
    ? 'store.status.installed'
    : isInstallable
      ? 'store.status.installable'
      : isChecking
        ? 'store.status.checking'
        : 'store.status.source'
  const primaryLabel = installedApp
    ? 'store.action.installed'
    : isInstallable
      ? 'store.action.install'
      : 'store.action.source'
  const primaryAction = isInstallable ? onInstall : onOpenSource

  useEffect(() => {
    setImageUrl(socialPreviewUrl(repo))
  }, [repo])

  return (
    <article
      className={`store-project-card store-project-card--${variant} ${selected ? 'selected' : ''}`}
      style={{ '--store-card-accent': accent } as CSSProperties}
      onClick={() => onSelect?.(repo)}
    >
      <div className="store-project-media">
        <img
          src={imageUrl}
          alt=""
          onError={() => setImageUrl(fallbackCover)}
        />
        <span className="store-project-status">{t(statusKey)}</span>
      </div>

      <div className="store-project-body">
        <div className="store-project-title-row">
          <h3 title={repo.name}>{repo.name}</h3>
          <button
            type="button"
            className={`store-favorite-btn ${favorite ? 'active' : ''}`}
            onClick={(event) => {
              event.stopPropagation()
              onFavorite?.(repo)
            }}
            aria-label={favorite ? t('repo.removeFavorite') : t('repo.addFavorite')}
            title={favorite ? t('repo.removeFavorite') : t('repo.addFavorite')}
          >
            {favorite ? '★' : '☆'}
          </button>
        </div>
        <p className="store-project-owner">{repo.owner.login}/{repo.name}</p>
        {variant !== 'row' && repo.description && (
          <p className="store-project-description">{repo.description}</p>
        )}
        <div className="store-project-meta">
          <span>{repo.language ?? t('details.unknown')}</span>
          <span>{t('repo.stars', { count: repo.stargazers_count.toLocaleString() })}</span>
          <span>{t('repo.updated', { date: updatedDate })}</span>
        </div>
        <div className="store-project-actions">
          <button
            type="button"
            className={isInstallable ? 'store-primary-btn' : 'store-secondary-btn'}
            onClick={(event) => {
              event.stopPropagation()
              primaryAction?.(repo)
            }}
          >
            {t(primaryLabel)}
          </button>
          <button
            type="button"
            className="store-secondary-btn"
            onClick={(event) => {
              event.stopPropagation()
              onSelect?.(repo)
            }}
          >
            {t('store.action.details')}
          </button>
        </div>
      </div>
      <span className="store-project-key">{repoKey(repo)}</span>
    </article>
  )
}

export default StoreProjectCard
