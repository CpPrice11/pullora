import { useEffect, useMemo, useState } from 'react'
import { useOwnerRepositories } from '../hooks/useGitHub'
import { useSettings } from '../hooks/useSettings'
import { useLibraryStatus } from '../hooks/useLibraryStatus'
import RepoCard from '../components/Search/RepoCard'
import ReleaseSelector from '../components/Search/ReleaseSelector'
import { launchApp } from '../services/installed'
import type { GitHubSearchResult } from '../types'
import { useI18n } from '../i18n'
import './PageStyles.css'

type LibraryFilter = 'all' | 'installed' | 'updates' | 'available'
type LibrarySort = 'updated' | 'name' | 'status'

function SearchPage() {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<LibraryFilter>('all')
  const [sort, setSort] = useState<LibrarySort>('updated')
  const [selectedRepo, setSelectedRepo] = useState<GitHubSearchResult | null>(null)
  const [launchError, setLaunchError] = useState<string | null>(null)
  const { settings, loading: settingsLoading } = useSettings()
  const owner = settings.githubOwner?.trim()
  const { state, loadRepositories, refreshRepositories, loadMore } = useOwnerRepositories(owner)
  const {
    checkingUpdates,
    getInstalledApp,
    getLatestVersion,
    refreshInstalledApps,
  } = useLibraryStatus(state.repositories)

  const handleRefresh = async () => {
    await Promise.all([
      refreshRepositories(),
      refreshInstalledApps(),
    ])
  }

  useEffect(() => {
    if (!settingsLoading) {
      loadRepositories(1)
    }
  }, [settingsLoading, loadRepositories])

  const visibleRepositories = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    const filtered = state.repositories.filter((repo) => {
      const installedApp = getInstalledApp(repo)
      const latestVersion = getLatestVersion(repo)
      const hasUpdate = Boolean(
        installedApp &&
        latestVersion &&
        latestVersion !== installedApp.activeVersion,
      )

      if (filter === 'installed' && !installedApp) return false
      if (filter === 'updates' && !hasUpdate) return false
      if (filter === 'available' && installedApp) return false

      if (!normalizedQuery) return true

      const searchableText = [
        repo.name,
        repo.full_name,
        repo.description ?? '',
        repo.language ?? '',
        ...(repo.topics ?? []),
      ]
        .join(' ')
        .toLowerCase()

      return searchableText.includes(normalizedQuery)
    })

    return [...filtered].sort((a, b) => {
      if (sort === 'name') {
        return a.name.localeCompare(b.name)
      }

      if (sort === 'status') {
        const statusRank = (repo: GitHubSearchResult) => {
          const installedApp = getInstalledApp(repo)
          const latestVersion = getLatestVersion(repo)
          if (
            installedApp &&
            latestVersion &&
            latestVersion !== installedApp.activeVersion
          ) {
            return 0
          }
          if (installedApp) return 1
          return 2
        }

        return statusRank(a) - statusRank(b) || a.name.localeCompare(b.name)
      }

      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    })
  }, [filter, getInstalledApp, getLatestVersion, query, sort, state.repositories])

  const handleLaunch = async (repo: GitHubSearchResult) => {
    setLaunchError(null)
    try {
      await launchApp(repo.owner.login, repo.name)
    } catch (err) {
      setLaunchError(err instanceof Error ? err.message : t('library.launchError'))
    }
  }

  const showLoadingState = owner && state.loading && state.repositories.length === 0

  return (
    <div className="page library-page">
      <div className="page-header">
        <h2>{t('library.title')}</h2>
        {owner && (
          <button
            type="button"
            className="refresh-btn"
            onClick={handleRefresh}
            disabled={state.loading || checkingUpdates}
          >
            {state.loading || checkingUpdates ? t('library.refreshing') : t('library.refresh')}
          </button>
        )}
      </div>

      {!owner && !settingsLoading && (
        <div className="empty-state">
          <h3>{t('library.noOwnerTitle')}</h3>
          <p>{t('library.noOwnerText')}</p>
        </div>
      )}

      {owner && (
        <>
          <div className="search-form">
            <input
              type="text"
              placeholder={t('library.searchPlaceholder')}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="search-input"
            />
          </div>

          <div className="library-controls">
            <div className="segmented-control" aria-label={t('library.filterLabel')}>
              {(['all', 'installed', 'updates', 'available'] as LibraryFilter[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  className={filter === item ? 'active' : ''}
                  onClick={() => setFilter(item)}
                >
                  {t(`library.${item === 'all' ? 'all' : item}`)}
                </button>
              ))}
            </div>

            <label className="sort-control" aria-label={t('library.sortLabel')}>
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as LibrarySort)}
              >
                <option value="updated">{t('library.recentlyUpdated')}</option>
                <option value="status">{t('library.status')}</option>
                <option value="name">{t('library.name')}</option>
              </select>
            </label>
          </div>

          {state.error && (
            <div className="error-banner">
              <span>{state.error}</span>
              <button type="button" onClick={handleRefresh}>
                {t('library.tryAgain')}
              </button>
            </div>
          )}

          {launchError && (
            <div className="error-banner">
              <span>{launchError}</span>
            </div>
          )}

          <p className="results-count">
            {t('library.count', {
              visible: visibleRepositories.length.toLocaleString(),
              total: state.repositories.length.toLocaleString(),
            })}
            {checkingUpdates ? t('library.checkingInstalled') : ''}
          </p>

          <div className="search-results">
            {showLoadingState && (
              <div className="library-skeleton" aria-label={t('library.loading')}>
                <div className="skeleton-card" />
                <div className="skeleton-card" />
                <div className="skeleton-card" />
              </div>
            )}

            {visibleRepositories.length === 0 && !state.loading && (
              <div className="empty-state">
                <h3>
                  {state.repositories.length === 0
                    ? t('library.emptyTitle')
                    : t('library.noMatchesTitle')}
                </h3>
                <p>
                  {state.repositories.length === 0
                    ? t('library.emptyText')
                    : t('library.noMatchesText')}
                </p>
              </div>
            )}

            {visibleRepositories.map((repo) => (
              <RepoCard
                key={repo.id}
                repo={repo}
                installedApp={getInstalledApp(repo)}
                latestVersion={getLatestVersion(repo)}
                onSelect={() => setSelectedRepo(repo)}
                onLaunch={() => handleLaunch(repo)}
              />
            ))}
          </div>

          {state.hasMore && !state.loading && (
            <button type="button" onClick={loadMore} className="load-more-btn">
              {t('library.loadMore')}
            </button>
          )}
        </>
      )}

      {selectedRepo && (
        <ReleaseSelector
          owner={selectedRepo.owner.login}
          repo={selectedRepo.name}
          displayName={selectedRepo.name}
          description={selectedRepo.description ?? undefined}
          onClose={() => setSelectedRepo(null)}
          onInstalled={refreshInstalledApps}
        />
      )}
    </div>
  )
}

export default SearchPage
