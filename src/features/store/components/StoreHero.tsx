import type { CSSProperties } from 'react'
import type { GitHubSearchResult, InstalledApp } from '../../../types'
import { languageAccent } from '../storeCatalog'
import type { StoreInstallability } from '../hooks/useStoreCatalog'
import { releaseAssetKindLabelKey, releaseAssetKindsForStatus } from '../assetClassifier'
import { useI18n } from '../../../i18n'
import heroBackdrop from '../assets/store-hero-scene.png'

interface StoreHeroProps {
  repo?: GitHubSearchResult
  items: GitHubSearchResult[]
  activeIndex: number
  personalized?: boolean
  installedApp?: InstalledApp
  installability?: StoreInstallability
  onActiveIndexChange: (index: number) => void
  onInstall: (repo: GitHubSearchResult) => void
  onOpenSource: (repo: GitHubSearchResult) => void
  onDetails: (repo: GitHubSearchResult) => void
  onBrowse: () => void
}

function StoreHero({
  repo,
  items,
  activeIndex,
  personalized = false,
  installedApp,
  installability,
  onActiveIndexChange,
  onInstall,
  onOpenSource,
  onDetails,
  onBrowse,
}: StoreHeroProps) {
  const { language, t } = useI18n()
  const itemCount = items.length

  if (!repo) {
    return (
      <section
        className="store-hero store-hero--empty"
        style={{ '--store-hero-image': `url("${heroBackdrop}")` } as CSSProperties}
      >
        <div className="store-hero-copy">
          <h2>{t('store.hero.emptyTitle')}</h2>
          <p className="store-hero-description">{t('store.hero.emptyText')}</p>
          <button type="button" className="store-primary-btn" onClick={onBrowse}>
            {t('store.nav.browse')}
          </button>
        </div>
      </section>
    )
  }

  const accent = languageAccent(repo.language)
  const topics = (repo.topics ?? []).slice(0, 4)
  const isInstallable = installability?.installable ?? repo.has_releases
  const assetKinds = releaseAssetKindsForStatus(installability)
  const latestTag = installability?.latestTag ?? null
  const statusKey = installedApp
    ? 'store.status.installed'
    : isInstallable
      ? 'store.status.installable'
      : installability?.checking
        ? 'store.status.checking'
        : 'store.status.source'
  const updatedDate = new Date(repo.updated_at).toLocaleDateString(language === 'en' ? 'en-US' : 'uk-UA')
  const canNavigate = itemCount > 1
  const normalizedIndex = Math.min(activeIndex, Math.max(itemCount - 1, 0))

  const showPrevious = () => {
    if (!canNavigate) return
    onActiveIndexChange((normalizedIndex - 1 + itemCount) % itemCount)
  }

  const showNext = () => {
    if (!canNavigate) return
    onActiveIndexChange((normalizedIndex + 1) % itemCount)
  }

  return (
    <section
      className="store-hero"
      style={{
        '--store-hero-image': `url("${heroBackdrop}")`,
        '--store-hero-accent': accent,
      } as CSSProperties}
    >
      <button
        type="button"
        className="store-hero-arrow store-hero-arrow--left"
        aria-label={t('carousel.previous')}
        disabled={!canNavigate}
        onClick={showPrevious}
      >
        <span aria-hidden="true">‹</span>
      </button>

      <div className="store-hero-copy">
        <span className="store-hero-kicker">
          {t(personalized ? 'store.hero.personalized' : 'store.section.recommended')}
        </span>
        <h2>{repo.name}</h2>
        <p className="store-hero-owner">{repo.owner.login}/{repo.name}</p>
        <p className="store-hero-description">{repo.description ?? ''}</p>

        <div className="store-hero-meta">
          {repo.language && <span>{repo.language}</span>}
          {assetKinds.map((kind) => (
            <span key={kind} className={`store-asset-badge store-asset-badge--${kind}`}>
              {t(releaseAssetKindLabelKey(kind))}
            </span>
          ))}
          {topics.map((topic) => <span key={topic}>{topic}</span>)}
          <span>{t(statusKey)}</span>
        </div>

        <div className="store-hero-stats">
          <span>{t('repo.stars', { count: repo.stargazers_count.toLocaleString() })}</span>
          <span>{t('repo.updated', { date: updatedDate })}</span>
          {latestTag && <span>{t('store.latestVersion', { version: latestTag })}</span>}
          {isInstallable && <span>{t('store.status.installable')}</span>}
        </div>

        <div className="store-hero-dots">
          {items.map((item, index) => (
            <button
              key={`${item.owner.login}/${item.name}`}
              type="button"
              aria-label={`${item.owner.login}/${item.name}`}
              className={index === normalizedIndex ? 'active' : ''}
              onClick={() => onActiveIndexChange(index)}
            />
          ))}
        </div>

        <div className="store-hero-actions">
          <button
            type="button"
            className={isInstallable ? 'store-primary-btn' : 'store-secondary-btn'}
            onClick={() => isInstallable ? onInstall(repo) : onOpenSource(repo)}
          >
            {t(isInstallable ? 'store.action.installLatest' : 'store.action.source')}
          </button>
          <button type="button" className="store-ghost-btn" onClick={() => onDetails(repo)}>
            {t('store.action.details')}
          </button>
        </div>
      </div>

      <button
        type="button"
        className="store-hero-arrow store-hero-arrow--right"
        aria-label={t('carousel.next')}
        disabled={!canNavigate}
        onClick={showNext}
      >
        <span aria-hidden="true">›</span>
      </button>
    </section>
  )
}

export default StoreHero
