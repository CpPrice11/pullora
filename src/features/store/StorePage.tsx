import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type { GitHubSearchResult } from '../../types'
import { openExternalUrl } from '../../services/updates'
import { projectArtBackgroundUrl } from '../../services/projectArt'
import ReleaseSelector from '../../components/Install/ReleaseSelector'
import StoreHero from './components/StoreHero'
import StoreCarousel from './components/StoreCarousel'
import StoreBrowse from './components/StoreBrowse'
import StoreAppDetailsModal from './components/StoreAppDetailsModal'
import StatePanel from '../../components/State/StatePanel'
import { useSettings } from '../../hooks/useSettings'
import { useOwnerStoreCatalog } from './hooks/useOwnerStoreCatalog'
import {
  repoKey,
  socialPreviewUrl,
  uniqueRepos,
  type StoreBrowseTab,
  type StoreInstallableFilter,
  type StoreProjectFilter,
} from './storeCatalog'
import { isStoreApplicationProject } from './projectClassifier'
import { useI18n } from '../../i18n'
import './Store.css'

interface StorePageProps {
  onOpenSettings?: () => void
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

function StorePage({ onOpenSettings, onPreviewBackground }: StorePageProps) {
  const { t } = useI18n()
  const { settings, loading: settingsLoading } = useSettings()
  const owner = settings.githubOwner?.trim()
  const [query, setQuery] = useState('')
  const [storeSearchQuery, setStoreSearchQuery] = useState('')
  const [browseTab, setBrowseTab] = useState<StoreBrowseTab>('popular')
  const [installableFilter, setInstallableFilter] = useState<StoreInstallableFilter>('all')
  const [projectFilter, setProjectFilter] = useState<StoreProjectFilter>('applications')
  const [heroIndex, setHeroIndex] = useState(0)
  const [selectedRepo, setSelectedRepo] = useState<GitHubSearchResult | undefined>()
  const [installTarget, setInstallTarget] = useState<StoreInstallTarget | null>(null)
  const [detailsRepo, setDetailsRepo] = useState<GitHubSearchResult | null>(null)

  const catalog = useOwnerStoreCatalog(
    settingsLoading ? undefined : owner,
    storeSearchQuery,
    browseTab,
    installableFilter,
    projectFilter,
  )
  const heroItems = useMemo(() => {
    const candidates = uniqueRepos(catalog.homeSections.flatMap((section) => section.items))
    return (projectFilter === 'all'
      ? candidates
      : candidates.filter(isStoreApplicationProject)
    ).slice(0, HERO_RECOMMENDATION_COUNT)
  }, [catalog.homeSections, projectFilter])
  const heroRepo = heroItems[heroIndex] ?? heroItems[0] ?? catalog.browseItems[0]
  const heroKey = heroRepo ? repoKey(heroRepo) : null
  const spotlightItems = useMemo(() => {
    const candidates = uniqueRepos(catalog.homeSections.flatMap((section) => section.items))
    return (projectFilter === 'all'
      ? candidates
      : candidates.filter(isStoreApplicationProject)
    )
      .sort((left, right) => right.stargazers_count - left.stargazers_count)
      .slice(0, 6)
  }, [catalog.homeSections, projectFilter])
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
    void catalog.checkInstallability(repo)
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
    void catalog.checkInstallability(repo)
  }

  const handleOpenSource = (repo: GitHubSearchResult) => {
    void openExternalUrl(repo.html_url).catch(() => {})
  }

  const submitSearch = (nextQuery = query) => {
    const trimmedQuery = nextQuery.trim()
    setStoreSearchQuery(trimmedQuery)
    setInstallableFilter('all')
    setSelectedRepo(undefined)
    window.setTimeout(scrollToBrowse, 0)
  }

  const handleSearchChange = (value: string) => {
    setQuery(value)
    setStoreSearchQuery(value.trim())
    setInstallableFilter('all')
  }

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    submitSearch()
  }

  const handleFavorites = () => {
    setQuery('')
    setStoreSearchQuery('')
    setBrowseTab('favorites')
    setInstallableFilter('all')
    setSelectedRepo(undefined)
    window.setTimeout(scrollToBrowse, 0)
  }

  const handleReturnHome = () => {
    setQuery('')
    setStoreSearchQuery('')
    setBrowseTab('popular')
    setInstallableFilter('all')
    setProjectFilter('applications')
    setSelectedRepo(undefined)
    window.setTimeout(() => {
      document.querySelector('.store-page')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 0)
  }

  const handleBrowseTabChange = (tab: StoreBrowseTab) => {
    setBrowseTab(tab)
  }

  const handleInstallableFilterChange = (filter: StoreInstallableFilter) => {
    setInstallableFilter(filter)
  }

  const handleProjectFilterChange = (filter: StoreProjectFilter) => {
    setProjectFilter(filter)
    setSelectedRepo(undefined)
  }

  const handleRefresh = () => {
    void catalog.refreshAll()
  }

  return (
    <div className="page store-page">
      <div className="store-toolbar">
        <form className={`store-search ${query ? 'store-search--has-query' : ''}`} onSubmit={handleSearchSubmit}>
          <span className="visually-hidden">{t('store.searchLabel')}</span>
          <input
            id="store-search-input"
            type="text"
            value={query}
            aria-label={t('store.searchLabel')}
            placeholder={t('store.searchPlaceholder')}
            onChange={(event) => handleSearchChange(event.target.value)}
          />
          {query && (
            <button
              type="button"
              className="store-search-clear"
              aria-label={t('store.search.clear')}
              title={t('store.search.clear')}
              onClick={handleReturnHome}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m7 7 10 10M17 7 7 17" />
              </svg>
            </button>
          )}
          <button type="submit" className="store-search-submit" aria-label={t('store.searchLabel')}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="6" />
              <path d="m16 16 4 4" />
            </svg>
          </button>
        </form>
        <button type="button" className="store-wishlist-btn" onClick={handleFavorites}>
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

      {!settingsLoading && !owner && (
        <StatePanel
          kind="empty"
          title={t('store.noOwnerTitle')}
          message={t('store.noOwnerText')}
          actionLabel={onOpenSettings ? t('store.openSettings') : undefined}
          onAction={onOpenSettings}
        />
      )}

      {owner && (
        <>
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
        titleKey="store.section.ownerProjects"
        subtitleKey="store.section.ownerProjectsText"
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

      <StoreBrowse
        resultsMode={Boolean(storeSearchQuery)}
        searchQuery={storeSearchQuery}
        items={catalog.browseItems}
        selectedRepo={browseSelectedRepo}
        tabs={catalog.browseTabs}
        activeTab={browseTab}
        installableFilter={installableFilter}
        projectFilter={projectFilter}
        loading={catalog.loadingBrowse}
        loadingInstallability={catalog.loadingInstallability}
        hasMore={catalog.hasMoreBrowse}
        favoriteKeys={catalog.favoriteKeys}
        installedByRepo={catalog.installedByRepo}
        installability={catalog.installability}
        projectArt={catalog.projectArt}
        onTabChange={handleBrowseTabChange}
        onFilterChange={handleInstallableFilterChange}
        onProjectFilterChange={handleProjectFilterChange}
        onSelect={handleSelect}
        onFavorite={catalog.toggleFavorite}
        onInstall={handleInstall}
        onOpenSource={handleOpenSource}
        onDetails={handleDetails}
        onLoadMore={catalog.loadMoreBrowse}
        onReturnHome={handleReturnHome}
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
        </>
      )}

      {detailsRepo && (
        <StoreAppDetailsModal
          repo={detailsRepo}
          art={catalog.projectArt[repoKey(detailsRepo)]}
          installedApp={catalog.installedByRepo.get(repoKey(detailsRepo))}
          installability={catalog.installability[repoKey(detailsRepo)]}
          runtime={catalog.runtime}
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
