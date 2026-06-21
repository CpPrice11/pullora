import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type { GitHubSearchResult } from '../../types'
import { openExternalUrl } from '../../services/updates'
import { projectArtBackgroundUrl } from '../../services/projectArt'
import ReleaseSelector from '../../components/Install/ReleaseSelector'
import StoreHero from './components/StoreHero'
import StoreCarousel from './components/StoreCarousel'
import StoreBrowse from './components/StoreBrowse'
import StoreAppDetailsModal from './components/StoreAppDetailsModal'
import { useStoreCatalog } from './hooks/useStoreCatalog'
import {
  repoKey,
  socialPreviewUrl,
  storeCategories,
  uniqueRepos,
  type StoreBrowseTab,
  type StoreInstallableFilter,
} from './storeCatalog'
import { useI18n } from '../../i18n'
import './Store.css'

interface StorePageProps {
  onPreviewBackground?: (url: string | null) => void
}

const HERO_RECOMMENDATION_COUNT = 6

function scrollToBrowse() {
  document.querySelector('.store-browse')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

interface StoreInstallTarget {
  repo: GitHubSearchResult
  initialReleaseTag?: string | null
}

function StorePage({ onPreviewBackground }: StorePageProps) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [storeSearchQuery, setStoreSearchQuery] = useState('')
  const [browseTab, setBrowseTab] = useState<StoreBrowseTab>('popular')
  const [installableFilter, setInstallableFilter] = useState<StoreInstallableFilter>('all')
  const [heroIndex, setHeroIndex] = useState(0)
  const [selectedRepo, setSelectedRepo] = useState<GitHubSearchResult | undefined>()
  const [installTarget, setInstallTarget] = useState<StoreInstallTarget | null>(null)
  const [detailsRepo, setDetailsRepo] = useState<GitHubSearchResult | null>(null)
  const [remoteBrowsingEnabled, setRemoteBrowsingEnabled] = useState(false)

  const catalog = useStoreCatalog(storeSearchQuery, browseTab, installableFilter, remoteBrowsingEnabled)
  const heroItems = useMemo(() => {
    const recommended = catalog.homeSections[0]?.items ?? []
    const supplemental = catalog.homeSections.slice(1).flatMap((section) => section.items)
    return uniqueRepos([
      ...recommended,
      ...supplemental,
      ...catalog.fallbackRepos,
    ]).slice(0, HERO_RECOMMENDATION_COUNT)
  }, [catalog.fallbackRepos, catalog.homeSections])
  const heroRepo = heroItems[heroIndex] ?? heroItems[0] ?? catalog.browseItems[0]
  const heroKey = heroRepo ? repoKey(heroRepo) : null
  const spotlightItems = useMemo(() => {
    const popular = catalog.homeSections.find((section) => section.id === 'popular')?.items ?? []
    return uniqueRepos([...popular, ...catalog.fallbackRepos])
      .sort((left, right) => right.stargazers_count - left.stargazers_count)
      .slice(0, 6)
  }, [catalog.fallbackRepos, catalog.homeSections])
  const browseSelectedRepo = useMemo(() => {
    if (catalog.browseItems.length === 0) return undefined
    if (selectedRepo && catalog.browseItems.some((repo) => repoKey(repo) === repoKey(selectedRepo))) {
      return selectedRepo
    }
    return catalog.browseItems[0]
  }, [catalog.browseItems, selectedRepo])
  const hasStoreContent = heroItems.length > 0
    || spotlightItems.length > 0
    || catalog.homeSections.some((section) => section.items.length > 0)
    || catalog.browseItems.length > 0
    || catalog.installedRepos.length > 0
    || catalog.favoriteRepos.length > 0
  const showBlockingError = Boolean(catalog.error) && !hasStoreContent
  const showInlineError = Boolean(catalog.error) && hasStoreContent
  const errorText = catalog.error?.startsWith('store.')
    ? t(catalog.error)
    : catalog.error

  useEffect(() => {
    if (heroIndex < heroItems.length) return
    setHeroIndex(0)
  }, [heroIndex, heroItems.length])

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
  }

  const handleInstall = (repo: GitHubSearchResult, releaseTag?: string | null) => {
    const key = repoKey(repo)
    setSelectedRepo(repo)
    setInstallTarget({
      repo,
      initialReleaseTag: releaseTag ?? catalog.installability[key]?.latestTag ?? null,
    })
  }

  const handleDetails = (repo: GitHubSearchResult) => {
    setSelectedRepo(repo)
    setDetailsRepo(repo)
  }

  const handleOpenSource = (repo: GitHubSearchResult) => {
    void openExternalUrl(repo.html_url).catch(() => {})
  }

  const submitSearch = (nextQuery = query) => {
    const trimmedQuery = nextQuery.trim()
    setStoreSearchQuery(trimmedQuery)
    if (browseTab === 'favorites') {
      setBrowseTab('popular')
    }
    setInstallableFilter('all')
    setSelectedRepo(undefined)
    setRemoteBrowsingEnabled(true)
    window.setTimeout(scrollToBrowse, 0)
  }

  const handleSearchChange = (value: string) => {
    setQuery(value)
    if (browseTab === 'favorites') {
      setBrowseTab('popular')
    }
    setInstallableFilter('all')
  }

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    submitSearch()
  }

  const handleCategory = (label: string) => {
    setQuery(label)
    setStoreSearchQuery(label.trim())
    setBrowseTab('popular')
    setInstallableFilter('all')
    setSelectedRepo(undefined)
    setRemoteBrowsingEnabled(true)
    window.setTimeout(scrollToBrowse, 0)
  }

  const handleBrowseTabChange = (tab: StoreBrowseTab) => {
    setBrowseTab(tab)
    if (tab !== 'favorites') {
      setRemoteBrowsingEnabled(true)
    }
  }

  const handleInstallableFilterChange = (filter: StoreInstallableFilter) => {
    setInstallableFilter(filter)
    if (filter === 'installable') {
      setRemoteBrowsingEnabled(true)
    }
  }

  const handleRefresh = () => {
    setRemoteBrowsingEnabled(true)
    void catalog.refreshAll()
  }

  return (
    <div className="page store-page">
      <div className="store-toolbar">
        <form className="store-search" onSubmit={handleSearchSubmit}>
          <span className="visually-hidden">{t('store.searchLabel')}</span>
          <input
            id="store-search-input"
            type="text"
            value={query}
            aria-label={t('store.searchLabel')}
            placeholder={t('store.searchPlaceholder')}
            onChange={(event) => handleSearchChange(event.target.value)}
          />
          <button type="submit" aria-label={t('store.searchLabel')}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="6" />
              <path d="m16 16 4 4" />
            </svg>
          </button>
        </form>
        <button type="button" className="store-wishlist-btn" onClick={() => setBrowseTab('favorites')}>
          <span aria-hidden="true">♡</span>
          {t('store.browse.favorites')}
        </button>
        <button type="button" className="store-refresh-btn" onClick={handleRefresh} aria-label={t('store.refresh')}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M20 12a8 8 0 1 1-2.35-5.65" />
            <path d="M20 4v6h-6" />
          </svg>
        </button>
      </div>

      {(showBlockingError || showInlineError) && (
        <div className="store-error" role="alert">
          {errorText}
        </div>
      )}

      <StoreHero
        repo={heroRepo}
        items={heroItems}
        activeIndex={heroIndex}
        personalized={catalog.personalized}
        installedApp={heroKey ? catalog.installedByRepo.get(heroKey) : undefined}
        installability={heroKey ? catalog.installability[heroKey] : undefined}
        onActiveIndexChange={setHeroIndex}
        onInstall={handleInstall}
        onOpenSource={handleOpenSource}
        onDetails={handleDetails}
        onBrowse={scrollToBrowse}
      />

      <StoreCarousel
        titleKey="store.section.spotlight"
        items={spotlightItems}
        favoriteKeys={catalog.favoriteKeys}
        installedByRepo={catalog.installedByRepo}
        installability={catalog.installability}
        projectArt={catalog.projectArt}
        onSelect={handleSelect}
        onFavorite={catalog.toggleFavorite}
        onInstall={handleInstall}
        onOpenSource={handleOpenSource}
        onDetails={handleDetails}
      />

      <StoreCarousel
        titleKey="store.section.installed"
        subtitleKey="store.section.installedText"
        items={catalog.installedRepos}
        favoriteKeys={catalog.favoriteKeys}
        installedByRepo={catalog.installedByRepo}
        installability={catalog.installability}
        projectArt={catalog.projectArt}
        onSelect={handleSelect}
        onFavorite={catalog.toggleFavorite}
        onInstall={handleInstall}
        onOpenSource={handleOpenSource}
        onDetails={handleDetails}
      />

      <StoreCarousel
        titleKey="store.section.favorites"
        subtitleKey="store.section.favoritesText"
        items={catalog.favoriteRepos}
        favoriteKeys={catalog.favoriteKeys}
        installedByRepo={catalog.installedByRepo}
        installability={catalog.installability}
        projectArt={catalog.projectArt}
        onSelect={handleSelect}
        onFavorite={catalog.toggleFavorite}
        onInstall={handleInstall}
        onOpenSource={handleOpenSource}
        onDetails={handleDetails}
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

      <StoreBrowse
        items={catalog.browseItems}
        selectedRepo={browseSelectedRepo}
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
        onTabChange={handleBrowseTabChange}
        onFilterChange={handleInstallableFilterChange}
        onSelect={handleSelect}
        onFavorite={catalog.toggleFavorite}
        onInstall={handleInstall}
        onOpenSource={handleOpenSource}
        onDetails={handleDetails}
        onLoadMore={catalog.loadMoreBrowse}
      />

      {catalog.homeSections.slice(1).map((section) => (
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
          onDetails={handleDetails}
        />
      ))}

      {detailsRepo && (
        <StoreAppDetailsModal
          repo={detailsRepo}
          art={catalog.projectArt[repoKey(detailsRepo)]}
          installedApp={catalog.installedByRepo.get(repoKey(detailsRepo))}
          installability={catalog.installability[repoKey(detailsRepo)]}
          favorite={catalog.favoriteKeys.has(repoKey(detailsRepo))}
          onClose={() => setDetailsRepo(null)}
          onInstall={(repo, releaseTag) => {
            setDetailsRepo(null)
            handleInstall(repo, releaseTag)
          }}
          onOpenSource={handleOpenSource}
          onFavorite={catalog.toggleFavorite}
        />
      )}

      {installTarget && (
        <ReleaseSelector
          owner={installTarget.repo.owner.login}
          repo={installTarget.repo.name}
          displayName={installTarget.repo.name}
          description={installTarget.repo.description ?? undefined}
          currentVersion={catalog.installedByRepo.get(repoKey(installTarget.repo))?.activeVersion}
          initialReleaseTag={installTarget.initialReleaseTag}
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
