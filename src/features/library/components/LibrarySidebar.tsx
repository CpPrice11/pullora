import type { ReactNode, Ref, UIEventHandler } from 'react'
import StatePanel from '../../../components/State/StatePanel'
import { useI18n } from '../../../i18n'
import type { GitHubSearchResult } from '../../../types'
import type { LibraryFilter, LibrarySort } from '../hooks/useLibraryFiltering'

export interface LibrarySection {
  id: string
  title: string
  repositories: GitHubSearchResult[]
  pinned?: boolean
}

export type LibraryDensity = 'normal' | 'compact'

interface LibrarySidebarGroup {
  id: string
  label: string
  sections: LibrarySection[]
}

interface LibrarySidebarProps {
  filter: LibraryFilter
  sort: LibrarySort
  density: LibraryDensity
  query: string
  groups: LibrarySidebarGroup[]
  collapsedFolderIds: Set<string>
  notices?: ReactNode
  bulkActions?: ReactNode
  showLoading: boolean
  showEmpty: boolean
  emptyTitle: string
  emptyMessage: string
  emptyActionLabel: string
  loading: boolean
  hasMore: boolean
  onFilterChange: (filter: LibraryFilter) => void
  onSortChange: (sort: LibrarySort) => void
  onDensityChange: (density: LibraryDensity) => void
  onQueryChange: (query: string) => void
  onToggleSection: (sectionId: string) => void
  onEmptyAction: () => void
  onLoadMore: () => void
  renderRepository: (repo: GitHubSearchResult) => ReactNode
  resultsRef?: Ref<HTMLDivElement>
  onResultsScroll?: UIEventHandler<HTMLDivElement>
}

export default function LibrarySidebar({
  filter,
  sort,
  density,
  query,
  groups,
  collapsedFolderIds,
  notices,
  bulkActions,
  showLoading,
  showEmpty,
  emptyTitle,
  emptyMessage,
  emptyActionLabel,
  loading,
  hasMore,
  onFilterChange,
  onSortChange,
  onDensityChange,
  onQueryChange,
  onToggleSection,
  onEmptyAction,
  onLoadMore,
  renderRepository,
  resultsRef,
  onResultsScroll,
}: LibrarySidebarProps) {
  const { t } = useI18n()

  return (
    <section className="library-sam-list-pane" aria-label={t('library.title')}>
      <section className="library-toolstrip" aria-label={t('library.filterLabel')}>
        <div className="library-sidebar-nav library-sidebar-filter-nav" aria-label={t('library.sidebar.navigation')}>
          {(['all', 'installed', 'updates', 'favorites'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              className={`library-sidebar-nav-btn ${filter === mode ? 'active' : ''}`}
              aria-pressed={filter === mode}
              onClick={() => onFilterChange(mode)}
            >
              {t(`library.${mode}`)}
            </button>
          ))}
        </div>

        <div className="library-sidebar-query-row">
          <div className="search-form">
            <label className="visually-hidden" htmlFor="library-search">
              {t('library.searchLabel')}
            </label>
            <input
              id="library-search"
              type="text"
              placeholder={t('library.searchPlaceholder')}
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              className="search-input"
              aria-label={t('library.searchLabel')}
            />
          </div>

          <div className="library-density-toggle" role="group" aria-label={t('library.viewDensity')}>
            {(['normal', 'compact'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                className={density === mode ? 'active' : ''}
                aria-pressed={density === mode}
                onClick={() => onDensityChange(mode)}
              >
                {t(mode === 'normal' ? 'library.viewNormal' : 'library.viewCompact')}
              </button>
            ))}
          </div>
        </div>

        <label className="library-sort-control">
          <span>{t('library.sortLabel')}</span>
          <select
            value={sort}
            onChange={(event) => onSortChange(event.target.value as LibrarySort)}
          >
            {(['name', 'launched', 'installed', 'updated'] as const).map((mode) => (
              <option key={mode} value={mode}>{t(`library.sort.${mode}`)}</option>
            ))}
          </select>
        </label>
      </section>

      <div className="search-results" ref={resultsRef} onScroll={onResultsScroll}>
        {notices}
        <div className="library-results-header" aria-hidden="true">
          <span>{t('library.name')}</span>
          <span>{t('nav.source')}</span>
          <span>{t('library.status')}</span>
          <span>{t('library.action')}</span>
        </div>

        {showLoading && <StatePanel kind="loading" title={t('library.loading')} skeletonCount={3} />}
        {showEmpty && (
          <StatePanel
            kind="empty"
            title={emptyTitle}
            message={emptyMessage}
            actionLabel={emptyActionLabel}
            onAction={onEmptyAction}
          />
        )}

        {groups.map((group) => (
          <div
            key={group.id}
            className={`library-folder-group library-folder-group--${group.id}`}
            aria-label={group.label}
          >
            <div className="library-folder-group-label">{group.label}</div>
            {group.sections.map((section) => {
              const isCollapsed = collapsedFolderIds.has(section.id)
              const sectionKind = section.id === 'favorites' || section.id === 'uncategorized'
                ? 'system'
                : 'custom'

              return (
                <section
                  key={section.id}
                  className={`library-folder-section ${sectionKind} ${section.pinned ? 'pinned' : ''} ${isCollapsed ? 'collapsed' : ''}`}
                >
                  <button
                    type="button"
                    className="library-folder-section-header"
                    aria-expanded={!isCollapsed}
                    onClick={() => onToggleSection(section.id)}
                  >
                    <span className="library-folder-section-title">
                      <span className="library-folder-section-chevron" aria-hidden="true" />
                      <span className="library-folder-section-icon" aria-hidden="true" />
                      <span>{section.title}</span>
                    </span>
                    <em>{t('library.folder.itemsCount', { count: section.repositories.length })}</em>
                  </button>
                  {!isCollapsed && (
                    <div className="library-folder-section-items">
                      {section.repositories.map(renderRepository)}
                    </div>
                  )}
                </section>
              )
            })}
          </div>
        ))}
      </div>

      {hasMore && (
        <button type="button" onClick={onLoadMore} className="load-more-btn" disabled={loading}>
          {loading ? t('library.loadingMore') : t('library.loadMore')}
        </button>
      )}
      {bulkActions}
    </section>
  )
}
