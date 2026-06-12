import type { GitHubSearchResult, InstalledApp, ProjectArt } from '../../../types'
import type { StoreBrowseTab, StoreInstallableFilter } from '../storeCatalog'
import { repoKey } from '../storeCatalog'
import type { StoreInstallability } from '../hooks/useStoreCatalog'
import StoreProjectCard from './StoreProjectCard'
import StorePreviewPanel from './StorePreviewPanel'
import { useI18n } from '../../../i18n'

interface StoreBrowseProps {
  items: GitHubSearchResult[]
  selectedRepo?: GitHubSearchResult
  tabs: StoreBrowseTab[]
  activeTab: StoreBrowseTab
  installableFilter: StoreInstallableFilter
  loading: boolean
  loadingInstallability: boolean
  hasMore: boolean
  favoriteKeys: Set<string>
  installedByRepo: Map<string, InstalledApp>
  installability: Record<string, StoreInstallability>
  projectArt: Record<string, ProjectArt>
  onTabChange: (tab: StoreBrowseTab) => void
  onFilterChange: (filter: StoreInstallableFilter) => void
  onSelect: (repo: GitHubSearchResult) => void
  onFavorite: (repo: GitHubSearchResult) => void
  onInstall: (repo: GitHubSearchResult) => void
  onOpenSource: (repo: GitHubSearchResult) => void
  onLoadMore: () => void
  onAiWorkspace?: (repo: GitHubSearchResult) => void
}

function StoreBrowse({
  items,
  selectedRepo,
  tabs,
  activeTab,
  installableFilter,
  loading,
  loadingInstallability,
  hasMore,
  favoriteKeys,
  installedByRepo,
  installability,
  projectArt,
  onTabChange,
  onFilterChange,
  onSelect,
  onFavorite,
  onInstall,
  onOpenSource,
  onLoadMore,
  onAiWorkspace,
}: StoreBrowseProps) {
  const { t } = useI18n()
  const selectedKey = selectedRepo ? repoKey(selectedRepo) : null

  return (
    <section className="store-browse" aria-label={t('store.nav.browse')}>
      <div className="store-browse-head">
        <div className="store-tabs" role="tablist" aria-label={t('store.browse.tabs')}>
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              className={activeTab === tab ? 'active' : ''}
              onClick={() => onTabChange(tab)}
            >
              {t(`store.browse.${tab}`)}
            </button>
          ))}
        </div>
        <div className="store-filter-toggle" role="group" aria-label={t('store.installableFilter')}>
          <button
            type="button"
            className={installableFilter === 'all' ? 'active' : ''}
            onClick={() => onFilterChange('all')}
          >
            {t('store.filter.all')}
          </button>
          <button
            type="button"
            className={installableFilter === 'installable' ? 'active' : ''}
            onClick={() => onFilterChange('installable')}
          >
            {t('store.filter.installable')}
          </button>
        </div>
      </div>

      <div className="store-browse-grid">
        <div className="store-browse-list">
          {loading && items.length === 0 && <div className="store-loading">{t('store.loading')}</div>}
          {!loading && !loadingInstallability && items.length === 0 && (
            <div className="store-empty">{t('store.emptyText')}</div>
          )}
          {items.map((repo) => {
            const key = repoKey(repo)
            return (
              <StoreProjectCard
                key={key}
                repo={repo}
                variant="row"
                selected={selectedKey === key}
                art={projectArt[key]}
                installedApp={installedByRepo.get(key)}
                installability={installability[key]}
                favorite={favoriteKeys.has(key)}
                onSelect={onSelect}
                onFavorite={onFavorite}
                onInstall={onInstall}
                onOpenSource={onOpenSource}
              />
            )
          })}
          {hasMore && (
            <button type="button" className="store-load-more" onClick={onLoadMore} disabled={loading}>
              {loading ? t('library.loadingMore') : t('library.loadMore')}
            </button>
          )}
        </div>

        <StorePreviewPanel
          repo={selectedRepo}
          art={selectedRepo ? projectArt[repoKey(selectedRepo)] : undefined}
          installedApp={selectedRepo ? installedByRepo.get(repoKey(selectedRepo)) : undefined}
          installability={selectedRepo ? installability[repoKey(selectedRepo)] : undefined}
          favorite={selectedRepo ? favoriteKeys.has(repoKey(selectedRepo)) : false}
          onInstall={onInstall}
          onOpenSource={onOpenSource}
          onFavorite={onFavorite}
          onAiWorkspace={onAiWorkspace}
        />
      </div>
    </section>
  )
}

export default StoreBrowse
