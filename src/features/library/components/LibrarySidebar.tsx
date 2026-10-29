import type { ReactNode, Ref, UIEventHandler } from 'react'
import StatePanel from '../../../components/State/StatePanel'
import NativeSelect from '../../../components/Select/NativeSelect'
import { CardsIcon, TableIcon, PlayIcon, UpdateIcon } from '../../../components/ui/Icons'
import { useI18n } from '../../../i18n'
import type { GitHubSearchResult } from '../../../types'
import {
  LIBRARY_FILTERS,
  LIBRARY_SORTS,
  type LibraryFilter,
  type LibrarySort,
  type LibraryViewMode,
} from '../libraryViewControls'

export interface LibrarySection {
  id: string
  title: string
  repositories: GitHubSearchResult[]
  pinned?: boolean
}

interface LibrarySidebarGroup {
  id: string
  label: string
  sections: LibrarySection[]
}

interface LibrarySidebarProps {
  filter: LibraryFilter
  sort: LibrarySort
  viewMode?: LibraryViewMode
  query: string
  groups: LibrarySidebarGroup[]
  collapsedFolderIds: Set<string>
  notices?: ReactNode
  bulkActions?: ReactNode
  details?: ReactNode
  summary?: ReactNode
  showLoading: boolean
  showEmpty: boolean
  emptyTitle: string
  emptyMessage: string
  emptyActionLabel: string
  loading: boolean
  refreshing: boolean
  hasMore: boolean
  onFilterChange: (filter: LibraryFilter) => void
  onSortChange: (sort: LibrarySort) => void
  onViewModeChange?: (mode: LibraryViewMode) => void
  onQueryChange: (query: string) => void
  onToggleSection: (sectionId: string) => void
  onEmptyAction: () => void
  onLoadMore: () => void
  onRefresh: () => void
  renderRepository: (repo: GitHubSearchResult) => ReactNode
  resultsRef?: Ref<HTMLDivElement>
  onResultsScroll?: UIEventHandler<HTMLDivElement>
}

type LibrarySidebarControlsProps = Pick<
  LibrarySidebarProps,
  | 'filter'
  | 'sort'
  | 'viewMode'
  | 'query'
  | 'refreshing'
  | 'onFilterChange'
  | 'onSortChange'
  | 'onViewModeChange'
  | 'onQueryChange'
  | 'onRefresh'
>

function LibrarySidebarControls({
  filter,
  sort,
  viewMode = 'cards',
  query,
  refreshing,
  onFilterChange,
  onSortChange,
  onViewModeChange,
  onQueryChange,
  onRefresh,
}: LibrarySidebarControlsProps) {
  const { t } = useI18n()

  return (
    <section className="library-toolstrip" aria-label={t('library.filterLabel')}>
      <div className="library-sidebar-nav library-sidebar-filter-nav" aria-label={t('library.sidebar.navigation')}>
        {LIBRARY_FILTERS.map((mode) => {
          const label = t(`library.${mode}`)
          const Icon = mode === 'updates' ? UpdateIcon : mode === 'installed' ? PlayIcon : null

          return (
            <button
              key={mode}
              type="button"
              className={`library-sidebar-nav-btn ${Icon ? 'icon-only' : ''} ${filter === mode ? 'active' : ''}`}
              aria-label={Icon ? label : undefined}
              aria-pressed={filter === mode}
              title={Icon ? label : undefined}
              onClick={() => onFilterChange(mode)}
            >
              {Icon ? <Icon className="library-filter-icon" /> : label}
            </button>
          )
        })}
      </div>

      <label className="library-sort-control">
        <span>{t('library.sortLabel')}</span>
        <NativeSelect
          value={sort}
          onValueChange={onSortChange}
          options={LIBRARY_SORTS.map((mode) => ({
            value: mode,
            label: t(`library.sort.${mode}`),
          }))}
        />
      </label>

      <div className="search-form">
        <label className="visually-hidden" htmlFor="library-search">
          {t('library.searchLabel')}
        </label>
        <input
          id="library-search"
          type="text"
          placeholder={t('library.searchPlaceholder')}
          value={query}
          onChange={(event) => onQueryChange(event.currentTarget.value)}
          className="search-input"
          aria-label={t('library.searchLabel')}
        />
        <button
          type="button"
          className={`library-refresh-btn ${refreshing ? 'is-refreshing' : ''}`}
          aria-label={refreshing ? t('library.refreshing') : t('library.refresh')}
          aria-busy={refreshing}
          title={refreshing ? t('library.refreshing') : t('library.refresh')}
          disabled={refreshing}
          onClick={onRefresh}
        >
          <UpdateIcon className="library-refresh-icon" />
        </button>
      </div>

      <div className="library-view-toggle" role="group" aria-label={t('library.viewMode')}>
        {(['cards', 'table'] as const).map((mode) => {
          const Icon = mode === 'cards' ? CardsIcon : TableIcon
          return <button key={mode} type="button" aria-label={t(`library.view.${mode}`)} title={t(`library.view.${mode}`)} aria-pressed={viewMode === mode} onClick={() => onViewModeChange?.(mode)}><Icon /></button>
        })}
      </div>
    </section>
  )
}

export default function LibrarySidebar({
  filter,
  sort,
  viewMode = 'cards',
  query,
  groups,
  collapsedFolderIds,
  notices,
  bulkActions,
  details,
  summary,
  showLoading,
  showEmpty,
  emptyTitle,
  emptyMessage,
  emptyActionLabel,
  loading,
  refreshing,
  hasMore,
  onFilterChange,
  onSortChange,
  onViewModeChange,
  onQueryChange,
  onToggleSection,
  onEmptyAction,
  onLoadMore,
  onRefresh,
  renderRepository,
  resultsRef,
  onResultsScroll,
}: LibrarySidebarProps) {
  const { t } = useI18n()

  return (
    <section className="library-sam-list-pane" aria-label={t('library.title')}>
      <LibrarySidebarControls
        filter={filter}
        sort={sort}
        viewMode={viewMode}
        query={query}
        refreshing={refreshing}
        onFilterChange={onFilterChange}
        onSortChange={onSortChange}
        onViewModeChange={onViewModeChange}
        onQueryChange={onQueryChange}
        onRefresh={onRefresh}
      />

      <div className="search-results" ref={resultsRef} onScroll={onResultsScroll}>
        {notices}
        {summary}
        {details}

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
                    viewMode === 'table' ? (
                      <div className="library-table-scroll" role="region" aria-label={t('library.tableFor', { name: section.title })} tabIndex={0}>
                        <table className="library-table">
                          <caption className="visually-hidden">{t('library.tableFor', { name: section.title })}</caption>
                          <thead><tr>
                            <th scope="col" aria-sort={sort === 'name' ? 'ascending' : undefined}>{t('library.table.app')}</th>
                            <th scope="col">{t('library.table.status')}</th>
                            <th scope="col">{t('library.table.installed')}</th>
                            <th scope="col">{t('library.ops.latest')}</th>
                            <th scope="col">{t('library.table.updated')}</th>
                            <th scope="col">{t('library.action')}</th>
                          </tr></thead>
                          <tbody>{section.repositories.map(renderRepository)}</tbody>
                        </table>
                      </div>
                    ) : <div className="library-folder-section-items">
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
