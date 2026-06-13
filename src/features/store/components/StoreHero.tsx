import type { CSSProperties } from 'react'
import type { GitHubSearchResult, InstalledApp } from '../../../types'
import { languageAccent } from '../storeCatalog'
import type { StoreInstallability } from '../hooks/useStoreCatalog'
import { useI18n } from '../../../i18n'
import heroBackdrop from '../assets/store-hero-scene.png'

interface StoreHeroProps {
  repo?: GitHubSearchResult
  personalized?: boolean
  installedApp?: InstalledApp
  installability?: StoreInstallability
  onInstall: (repo: GitHubSearchResult) => void
  onOpenSource: (repo: GitHubSearchResult) => void
  onBrowse: () => void
}

function StoreHero({
  repo,
  personalized = false,
  installedApp,
  installability,
  onInstall,
  onOpenSource,
  onBrowse,
}: StoreHeroProps) {
  const { language, t } = useI18n()

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
  const isInstallable = Boolean(installability?.installable)
  const statusKey = installedApp
    ? 'store.status.installed'
    : isInstallable
      ? 'store.status.installable'
      : installability?.checking
        ? 'store.status.checking'
        : 'store.status.source'
  const updatedDate = new Date(repo.updated_at).toLocaleDateString(language === 'en' ? 'en-US' : 'uk-UA')

  return (
    <section
      className="store-hero"
      style={{
        '--store-hero-image': `url("${heroBackdrop}")`,
        '--store-hero-accent': accent,
      } as CSSProperties}
    >
      <button type="button" className="store-hero-arrow store-hero-arrow--left" aria-label={t('carousel.previous')}>
        <span aria-hidden="true">‹</span>
      </button>

      <div className="store-hero-copy">
        <span className="store-hero-kicker">
          {t(personalized ? 'store.hero.personalized' : 'store.section.recommended')}
        </span>
        <h2>{repo.name}</h2>
        <p className="store-hero-owner">{repo.owner.login}/{repo.name}</p>
        {repo.description && <p className="store-hero-description">{repo.description}</p>}

        <div className="store-hero-meta">
          {repo.language && <span>{repo.language}</span>}
          {topics.map((topic) => <span key={topic}>{topic}</span>)}
          <span>{t(statusKey)}</span>
        </div>

        <div className="store-hero-stats">
          <span>{t('repo.stars', { count: repo.stargazers_count.toLocaleString() })}</span>
          <span>{t('repo.updated', { date: updatedDate })}</span>
          {isInstallable && <span>{t('store.status.installable')}</span>}
        </div>

        <div className="store-hero-actions">
          <button
            type="button"
            className={isInstallable ? 'store-primary-btn' : 'store-secondary-btn'}
            onClick={() => isInstallable ? onInstall(repo) : onOpenSource(repo)}
          >
            {t(isInstallable ? 'store.action.install' : 'store.action.source')}
          </button>
          <button type="button" className="store-ghost-btn" onClick={onBrowse}>
            {t('store.action.details')}
          </button>
        </div>

        <div className="store-hero-dots" aria-hidden="true">
          <span className="active" />
          <span />
          <span />
          <span />
        </div>
      </div>

      <button type="button" className="store-hero-arrow store-hero-arrow--right" aria-label={t('carousel.next')}>
        <span aria-hidden="true">›</span>
      </button>
    </section>
  )
}

export default StoreHero
