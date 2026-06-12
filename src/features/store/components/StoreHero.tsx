import type { GitHubSearchResult, InstalledApp, ProjectArt } from '../../../types'
import type { CSSProperties } from 'react'
import { projectArtBackgroundUrl, projectArtCoverUrl } from '../../../services/projectArt'
import { languageAccent, socialPreviewUrl } from '../storeCatalog'
import type { StoreInstallability } from '../hooks/useStoreCatalog'
import { useI18n } from '../../../i18n'

interface StoreHeroProps {
  repo?: GitHubSearchResult
  art?: ProjectArt
  installedApp?: InstalledApp
  installability?: StoreInstallability
  favorite?: boolean
  onInstall: (repo: GitHubSearchResult) => void
  onOpenSource: (repo: GitHubSearchResult) => void
  onFavorite: (repo: GitHubSearchResult) => void
  onBrowse: () => void
}

function StoreHero({
  repo,
  art,
  installedApp,
  installability,
  favorite = false,
  onInstall,
  onOpenSource,
  onFavorite,
  onBrowse,
}: StoreHeroProps) {
  const { t } = useI18n()

  if (!repo) {
    return (
      <section className="store-hero store-hero--empty">
        <div className="store-hero-copy">
          <h2>{t('store.hero.emptyTitle')}</h2>
          <p>{t('store.hero.emptyText')}</p>
          <button type="button" className="store-primary-btn" onClick={onBrowse}>
            {t('store.nav.browse')}
          </button>
        </div>
      </section>
    )
  }

  const accent = languageAccent(repo.language)
  const socialPreview = socialPreviewUrl(repo)
  const backgroundUrl = projectArtBackgroundUrl(art) ?? socialPreview
  const coverUrl = projectArtCoverUrl(art) ?? socialPreview
  const isInstallable = Boolean(installability?.installable)
  const statusKey = installedApp
    ? 'store.status.installed'
    : isInstallable
      ? 'store.status.installable'
      : installability?.checking
        ? 'store.status.checking'
        : 'store.status.source'

  return (
    <section
      className="store-hero"
      style={{
        '--store-hero-image': `url("${backgroundUrl}")`,
        '--store-hero-accent': accent,
      } as CSSProperties}
    >
      <div className="store-hero-copy">
        <div className="store-hero-meta">
          <span>{t(statusKey)}</span>
          {repo.language && <span>{repo.language}</span>}
          <span>{t('repo.stars', { count: repo.stargazers_count.toLocaleString() })}</span>
        </div>
        <h2>{repo.name}</h2>
        <p className="store-hero-owner">{repo.owner.login}/{repo.name}</p>
        {repo.description && <p className="store-hero-description">{repo.description}</p>}
        <div className="store-hero-actions">
          <button
            type="button"
            className={isInstallable ? 'store-primary-btn' : 'store-secondary-btn'}
            onClick={() => isInstallable ? onInstall(repo) : onOpenSource(repo)}
          >
            {t(isInstallable ? 'store.action.install' : 'store.action.source')}
          </button>
          <button type="button" className="store-secondary-btn" onClick={() => onFavorite(repo)}>
            {favorite ? t('repo.removeFavorite') : t('repo.addFavorite')}
          </button>
          <button type="button" className="store-ghost-btn" onClick={onBrowse}>
            {t('store.nav.browse')}
          </button>
        </div>
      </div>

      <div className="store-hero-art">
        <img src={coverUrl} alt="" />
      </div>
    </section>
  )
}

export default StoreHero
