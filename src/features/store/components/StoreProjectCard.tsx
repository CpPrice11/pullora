import { useEffect, useState, type CSSProperties } from 'react'
import type { GitHubSearchResult, InstalledApp, ProjectArt } from '../../../types'
import { projectArtCoverUrl } from '../../../services/projectArt'
import { languageAccent, repoKey } from '../storeCatalog'
import type { StoreInstallability } from '../hooks/useStoreCatalog'
import { releaseAssetKindLabelKey, releaseAssetKindsForStatus } from '../assetClassifier'
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
  const appIcon = projectArtCoverUrl(art) ?? repo.owner.avatar_url
  const [imageUrl, setImageUrl] = useState(appIcon)
  const updatedDate = new Date(repo.updated_at).toLocaleDateString(language === 'en' ? 'en-US' : 'uk-UA')
  const accent = languageAccent(repo.language)
  const topics = (repo.topics ?? []).slice(0, 2)
  const isInstallable = Boolean(installability?.installable)
  const isChecking = Boolean(installability?.checking)
  const assetKinds = releaseAssetKindsForStatus(installability)
  const latestTag = installability?.latestTag ?? null
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
      ? 'store.action.installLatest'
      : 'store.action.source'
  const primaryAction = isInstallable ? onInstall : onOpenSource

  useEffect(() => {
    setImageUrl(appIcon)
  }, [appIcon])

  if (variant === 'row') {
    return (
      <article
        className={`store-project-card store-project-card--row ${selected ? 'selected' : ''}`}
        style={{ '--store-card-accent': accent } as CSSProperties}
        onClick={() => onSelect?.(repo)}
      >
        <div className="store-row-main">
          <div className="store-project-media">
            <img src={imageUrl} alt="" onError={() => setImageUrl(repo.owner.avatar_url)} />
          </div>
          <div className="store-row-title">
            <h3 title={repo.name}>{repo.name}</h3>
            <p>{repo.description ?? `${repo.owner.login}/${repo.name}`}</p>
          </div>
        </div>
        <div className="store-row-owner">
          <span className="store-github-dot" aria-hidden="true" />
          <span>{repo.owner.login}</span>
        </div>
        <div className="store-row-tags">
          {repo.language && <span>{repo.language}</span>}
          {assetKinds.map((kind) => (
            <span key={kind} className={`store-asset-badge store-asset-badge--${kind}`}>
              {t(releaseAssetKindLabelKey(kind))}
            </span>
          ))}
          {latestTag && <span>{t('store.latestVersion', { version: latestTag })}</span>}
          {topics.map((topic) => <span key={topic}>{topic}</span>)}
        </div>
        <span className="store-row-date">{updatedDate}</span>
        <span className="store-row-stars">{repo.stargazers_count.toLocaleString()}</span>
        <span className={`store-row-status ${isInstallable || installedApp ? 'ready' : ''}`} title={t(statusKey)}>
          {isInstallable || installedApp ? '✓' : '○'}
        </span>
        <span className="store-project-key">{repoKey(repo)}</span>
      </article>
    )
  }

  return (
    <article
      className={`store-project-card store-project-card--${variant} ${selected ? 'selected' : ''}`}
      style={{ '--store-card-accent': accent } as CSSProperties}
      onClick={() => onSelect?.(repo)}
    >
      <div className="store-project-media">
        <img src={imageUrl} alt="" onError={() => setImageUrl(repo.owner.avatar_url)} />
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
        {repo.description && <p className="store-project-description">{repo.description}</p>}
        <div className="store-project-meta">
          {repo.language && <span>{repo.language}</span>}
          {assetKinds.map((kind) => (
            <span key={kind} className={`store-asset-badge store-asset-badge--${kind}`}>
              {t(releaseAssetKindLabelKey(kind))}
            </span>
          ))}
          {latestTag && <span>{t('store.latestVersion', { version: latestTag })}</span>}
          <span>{t('repo.stars', { count: repo.stargazers_count.toLocaleString() })}</span>
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
