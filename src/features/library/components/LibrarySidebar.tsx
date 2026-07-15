import type { ReactNode } from 'react'
import StatePanel from '../../../components/State/StatePanel'
import { useI18n } from '../../../i18n'
import type { GitHubSearchResult } from '../../../types'
import type { LibraryViewMode } from '../hooks/useLibraryFiltering'

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
  viewMode: LibraryViewMode
  query: string
  groups: LibrarySidebarGroup[]
  collapsedFolderIds: Set<string>
  notices?: ReactNode
  showLoading: boolean
  showEmpty: boolean
  emptyTitle: string
  emptyMessage: string
  emptyActionLabel: string
  loading: boolean
  hasMore: boolean
  onViewModeChange: (mode: LibraryViewMode) => void
  onQueryChange: (query: string) => void
  onToggleSection: (sectionId: string) => void
  onEmptyAction: () => void
  onLoadMore: () => void
  renderRepository: (repo: GitHubSearchResult) => ReactNode
}

function SidebarIcon({ name }: { name: 'clock' | 'play' }) {
  return (
    <svg className="library-action-icon" viewBox="0 0 24 24" aria-hidden="true">
      {name === 'clock' ? (
        <>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 7.5v5l3.25 2" />
        </>
      ) : (
        <path className="icon-fill" d="m9 7 8 5-8 5Z" />
      )}
    </svg>
  )
}

export default function LibrarySidebar({
  viewMode,
  query,
  groups,
  collapsedFolderIds,
  notices,
  showLoading,
  showEmpty,
  emptyTitle,
  emptyMessage,
  emptyActionLabel,
  loading,
  hasMore,
  onViewModeChange,
  onQueryChange,
  onToggleSection,
  onEmptyAction,
  onLoadMore,
  renderRepository,
}: LibrarySidebarProps) {
  const { t } = useI18n()

  return (
    <section className="library-sam-list-pane" aria-label={t('library.title')}>
      <section className="library-toolstrip" aria-label={t('library.filterLabel')}>
        <div className="library-sidebar-nav" aria-label={t('library.sidebar.navigation')}>
          <button
            type="button"
            className={`library-sidebar-nav-btn library-sidebar-nav-home ${viewMode === 'home' ? 'active' : ''}`}
            aria-pressed={viewMode === 'home'}
            onClick={() => onViewModeChange('home')}
          >
            {t('library.nav.home')}
          </button>
          {(['recent', 'ready'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              className={`library-sidebar-nav-btn library-sidebar-nav-icon ${viewMode === mode ? 'active' : ''}`}
              aria-label={t(`library.nav.${mode}`)}
              title={t(`library.nav.${mode}`)}
              aria-pressed={viewMode === mode}
              onClick={() => onViewModeChange(mode)}
            >
              <SidebarIcon name={mode === 'recent' ? 'clock' : 'play'} />
            </button>
          ))}
        </div>

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
      </section>

      <div className="search-results">
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
    </section>
  )
}
