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
    return catalog.homeSections.flatMap((section) => section.items).slice(0, 8)
  }, [catalog.homeSections])

  useEffect(() => {
    const timer = window.setTimeout(() => setStoreSearchQuery(query.trim()), 350)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    if (selectedRepo) return
    const first = catalog.browseItems[0] ?? catalog.homeSections[0]?.items[0]
    if (first) {
      setSelectedRepo(first)
    }
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

  return (
    <div className="page store-page">
      <div className="store-topbar">
        <div className="store-nav-tabs" role="tablist" aria-label={t('store.nav.label')}>
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
            ⌕
          </button>
        </label>
        <button type="button" className="store-refresh-btn" onClick={() => catalog.refreshAll()}>
          {catalog.loadingHome || catalog.loadingBrowse ? t('store.refreshing') : t('store.refresh')}
        </button>
      </div>

      {catalog.error && (
        <div className="store-error" role="alert">
          {catalog.error}
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

          <section className="store-section store-categories-section">
            <div className="store-section-head">
              <div>
                <h2>{t('store.section.categories')}</h2>
                <p>{t('store.section.categoriesText')}</p>
              </div>
            </div>
            <div className="store-category-grid">
              {storeCategories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  className={`store-category-tile store-category-tile--${category.id}`}
                  onClick={() => handleCategory(category.language ?? category.topic ?? category.title)}
                >
                  <span>{category.title}</span>
                </button>
              ))}
            </div>
          </section>

          <StoreCarousel
            titleKey="store.section.spotlight"
            subtitleKey="store.section.spotlightText"
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

          {catalog.homeSections.map((section) => (
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

      {view === 'browse' && (
        <StoreBrowse
          items={catalog.browseItems}
          selectedRepo={selectedRepo}
          tabs={catalog.browseTabs}
          activeTab={browseTab}
          installableFilter={installableFilter}
          loading={catalog.loadingBrowse}
          loadingInstallability={catalog.loadingInstallability}
          hasMore={catalog.hasMoreBrowse}
          favoriteKeys={catalog.favoriteKeys}
          installedByRepo={catalog.installedByRepo}
          installability={catalog.installability}
          projectArt={catalog.projectArt}
          onTabChange={setBrowseTab}
          onFilterChange={setInstallableFilter}
          onSelect={handleSelect}
          onFavorite={catalog.toggleFavorite}
          onInstall={handleInstall}
          onOpenSource={handleOpenSource}
          onLoadMore={catalog.loadMoreBrowse}
          onAiWorkspace={onOpenAiWorkspace}
        />
      )}

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
