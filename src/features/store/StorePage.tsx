import { useEffect, useMemo, useState } from 'react'
import type { GitHubSearchResult } from '../../types'
import { openExternalUrl } from '../../services/updates'
import { projectArtBackgroundUrl } from '../../services/projectArt'
import ReleaseSelector from '../../components/Install/ReleaseSelector'
import StoreHero from './components/StoreHero'
import StoreCarousel from './components/StoreCarousel'
import StoreBrowse from './components/StoreBrowse'
import { useStoreCatalog } from './hooks/useStoreCatalog'
import {
  repoKey,
  socialPreviewUrl,
  storeCategories,
  type StoreBrowseTab,
  type StoreInstallableFilter,
} from './storeCatalog'
import { useI18n } from '../../i18n'
import './Store.css'

interface StorePageProps {
  onOpenAiWorkspace?: (repo: GitHubSearchResult) => void
  onPreviewBackground?: (url: string | null) => void
}

function StorePage({ onOpenAiWorkspace, onPreviewBackground }: StorePageProps) {
  const { t } = useI18n()
  const [view, setView] = useState<'home' | 'browse'>('home')
  const [query, setQuery] = useState('')
  const [storeSearchQuery, setStoreSearchQuery] = useState('')
  const [browseTab, setBrowseTab] = useState<StoreBrowseTab>('popular')
  const [installableFilter, setInstallableFilter] = useState<StoreInstallableFilter>('all')
  const [selectedRepo, setSelectedRepo] = useState<GitHubSearchResult | undefined>()
  const [installTarget, setInstallTarget] = useState<GitHubSearchResult | null>(null)

  const catalog = useStoreCatalog(storeSearchQuery, browseTab, installableFilter)
  const heroRepo = selectedRepo ?? catalog.homeSections[0]?.items[0] ?? catalog.browseItems[0]
  const heroKey = heroRepo ? repoKey(heroRepo) : null
  const recommendedItems = useMemo(() => {
    return catalog.homeSections.flatMap((section) => section.items).slice(0, 6)
  }, [catalog.homeSections])
  const showBlockingError = Boolean(catalog.error) &&
    catalog.homeSections.every((section) => section.items.length === 0) &&
    catalog.browseItems.length === 0
  const errorText = catalog.error?.startsWith('store.')
    ? t(catalog.error)
    : catalog.error

  useEffect(() => {
    const timer = window.setTimeout(() => setStoreSearchQuery(query.trim()), 350)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    if (selectedRepo) return
    const first = catalog.browseItems[0] ?? catalog.homeSections[0]?.items[0]
    if (first) setSelectedRepo(first)
  }, [catalog.browseItems, catalog.homeSections, selectedRepo])

  useEffect(() => {
    if (!heroRepo) return
    void catalog.checkInstallability(heroRepo)
  }, [catalog, heroRepo])

  useEffect(() => {
    if (!heroRepo || !heroKey) {
      onPreviewBackground?.(null)
      return
    }

    const art = catalog.projectArt[heroKey]
    onPreviewBackground?.(projectArtBackgroundUrl(art) ?? socialPreviewUrl(heroRepo))
  }, [catalog.projectArt, heroKey, heroRepo, onPreviewBackground])

  useEffect(() => {
    return () => onPreviewBackground?.(null)
  }, [onPreviewBackground])

  const handleSelect = (repo: GitHubSearchResult) => {
    setSelectedRepo(repo)
    void catalog.checkInstallability(repo)
  }

  const handleInstall = (repo: GitHubSearchResult) => {
    setSelectedRepo(repo)
    setInstallTarget(repo)
  }

  const handleOpenSource = (repo: GitHubSearchResult) => {
    void openExternalUrl(repo.html_url).catch(() => {})
  }

  const handleCategory = (label: string) => {
    setQuery(label)
    setBrowseTab('popular')
    setView('browse')
  }

  const renderBrowse = (embedded = false) => (
    <StoreBrowse
      embedded={embedded}
      items={embedded ? catalog.browseItems.slice(0, 6) : catalog.browseItems}
      selectedRepo={selectedRepo}
      tabs={catalog.browseTabs}
      activeTab={browseTab}
      installableFilter={installableFilter}
      loading={catalog.loadingBrowse}
      loadingInstallability={catalog.loadingInstallability}
      hasMore={embedded ? false : catalog.hasMoreBrowse}
      favoriteKeys={catalog.favoriteKeys}
      installedByRepo={catalog.installedByRepo}
      installability={catalog.installability}
      projectArt={catalog.projectArt}
      onTabChange={(tab) => {
        setBrowseTab(tab)
        if (embedded) setView('browse')
      }}
      onFilterChange={(filter) => {
        setInstallableFilter(filter)
        if (embedded) setView('browse')
      }}
      onSelect={handleSelect}
      onFavorite={catalog.toggleFavorite}
      onInstall={handleInstall}
      onOpenSource={handleOpenSource}
      onLoadMore={catalog.loadMoreBrowse}
      onAiWorkspace={onOpenAiWorkspace}
    />
  )

  return (
    <div className="page store-page">
      <div className="store-topbar">
        <div className="store-nav-tabs" role="tablist" aria-label={t('store.nav.label')}>
          <button type="button" className={`store-home-icon ${view === 'home' ? 'active' : ''}`} onClick={() => setView('home')} aria-label={t('store.nav.home')}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 11.5 12 5l8 6.5" />
              <path d="M6.5 10.5V20h11v-9.5" />
            </svg>
          </button>
          <button type="button" className={view === 'home' ? 'active' : ''} onClick={() => setView('home')}>
            {t('store.nav.home')}
          </button>
          <button type="button" className={view === 'browse' ? 'active' : ''} onClick={() => setView('browse')}>
            {t('store.nav.browse')}
          </button>
          <button type="button" onClick={() => {
            setBrowseTab('popular')
            setView('browse')
          }}>
            {t('store.nav.popular')}
          </button>
          <button type="button" onClick={() => {
            setBrowseTab('updated')
            setView('browse')
          }}>
            {t('store.nav.updated')}
          </button>
          <button type="button" onClick={() => {
            setInstallableFilter('installable')
            setView('browse')
          }}>
            {t('store.nav.installable')}
          </button>
        </div>

        <div className="store-topbar-actions">
          <label className="store-search" htmlFor="store-search-input">
            <span className="visually-hidden">{t('store.searchLabel')}</span>
            <input
              id="store-search-input"
              type="text"
              value={query}
              placeholder={t('store.searchPlaceholder')}
              onChange={(event) => {
                setQuery(event.target.value)
                setView('browse')
              }}
            />
            <button type="button" onClick={() => setView('browse')} aria-label={t('store.searchLabel')}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="11" cy="11" r="6" />
                <path d="m16 16 4 4" />
              </svg>
            </button>
          </label>
          <button type="button" className="store-wishlist-btn" onClick={() => {
            setBrowseTab('favorites')
            setView('browse')
          }}>
            <span aria-hidden="true">♡</span>
            {t('store.browse.favorites')}
          </button>
          <button type="button" className="store-refresh-btn" onClick={() => catalog.refreshAll()} aria-label={t('store.refresh')}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M20 12a8 8 0 1 1-2.35-5.65" />
              <path d="M20 4v6h-6" />
            </svg>
          </button>
        </div>
      </div>

      {showBlockingError && (
        <div className="store-error" role="alert">
          {errorText}
        </div>
      )}

      {view === 'home' && (
        <>
          <StoreHero
            repo={heroRepo}
            art={heroKey ? catalog.projectArt[heroKey] : undefined}
            installedApp={heroKey ? catalog.installedByRepo.get(heroKey) : undefined}
            installability={heroKey ? catalog.installability[heroKey] : undefined}
            favorite={heroKey ? catalog.favoriteKeys.has(heroKey) : false}
            onInstall={handleInstall}
            onOpenSource={handleOpenSource}
            onFavorite={catalog.toggleFavorite}
            onBrowse={() => setView('browse')}
          />

          <StoreCarousel
            titleKey="store.section.spotlight"
            items={recommendedItems}
            favoriteKeys={catalog.favoriteKeys}
            installedByRepo={catalog.installedByRepo}
            installability={catalog.installability}
            projectArt={catalog.projectArt}
            onSelect={handleSelect}
            onFavorite={catalog.toggleFavorite}
            onInstall={handleInstall}
            onOpenSource={handleOpenSource}
          />

          <section className="store-section store-categories-section">
            <div className="store-section-head">
              <h2>{t('store.section.categories')}</h2>
            </div>
            <div className="store-category-grid">
              {storeCategories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  className={`store-category-tile store-category-tile--${category.id}`}
                  onClick={() => handleCategory(category.language ?? category.topic ?? category.title)}
                >
                  <span className="store-category-icon" aria-hidden="true">{category.icon}</span>
                  <span>{category.title}</span>
                  <small>{t('store.category.projects', { count: category.estimate })}</small>
                </button>
              ))}
            </div>
          </section>

          {renderBrowse(true)}

          {catalog.homeSections.slice(1, 3).map((section) => (
            <StoreCarousel
              key={section.id}
              titleKey={section.titleKey}
              subtitleKey={section.subtitleKey}
              items={section.items}
              favoriteKeys={catalog.favoriteKeys}
              installedByRepo={catalog.installedByRepo}
              installability={catalog.installability}
              projectArt={catalog.projectArt}
              onSelect={handleSelect}
              onFavorite={catalog.toggleFavorite}
              onInstall={handleInstall}
              onOpenSource={handleOpenSource}
            />
          ))}
        </>
      )}

      {view === 'browse' && renderBrowse(false)}

      {installTarget && (
        <ReleaseSelector
          owner={installTarget.owner.login}
          repo={installTarget.name}
          displayName={installTarget.name}
          description={installTarget.description ?? undefined}
          currentVersion={catalog.installedByRepo.get(repoKey(installTarget))?.activeVersion}
          onClose={() => setInstallTarget(null)}
          onInstalled={() => {
            setInstallTarget(null)
            void catalog.refreshLocalState()
          }}
        />
      )}
    </div>
  )
}

export default StorePage
