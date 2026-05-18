import { useEffect, useMemo, useState } from 'react'
import { useOwnerRepositories } from '../hooks/useGitHub'
import { useSettings } from '../hooks/useSettings'
import { useLibraryStatus } from '../hooks/useLibraryStatus'
import RepoCard from '../components/Search/RepoCard'
import ReleaseSelector from '../components/Search/ReleaseSelector'
import StatePanel from '../components/State/StatePanel'
import { launchApp, openInstalledAppDir } from '../services/installed'
import { addToFavorites, getFavorites, removeFromFavorites } from '../services/favorites'
import { pickImageFile } from '../services/dialog'
import {
  clearProjectArt,
  listProjectArt,
  projectArtCoverUrl,
  projectArtKey,
  setProjectArt,
} from '../services/projectArt'
import type { GitHubSearchResult, ProjectArt } from '../types'
import { useI18n } from '../i18n'
import './PageStyles.css'

type LibraryFilter = 'all' | 'installed' | 'favorites' | 'updates' | 'available'
type LibrarySort = 'updated' | 'name' | 'status'

interface SearchPageProps {
  hasLauncherBackground?: boolean
  onChangeLauncherBackground?: () => Promise<void> | void
  onClearLauncherBackground?: () => Promise<void> | void
}

function SearchPage({
  hasLauncherBackground = false,
  onChangeLauncherBackground,
  onClearLauncherBackground,
}: SearchPageProps) {
  const { language, t } = useI18n()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<LibraryFilter>('all')
  const [sort, setSort] = useState<LibrarySort>('updated')
  const [selectedRepo, setSelectedRepo] = useState<GitHubSearchResult | null>(null)
  const [featuredRepo, setFeaturedRepo] = useState<GitHubSearchResult | null>(null)
  const [projectArt, setProjectArtState] = useState<Record<string, ProjectArt>>({})
  const [favoriteKeys, setFavoriteKeys] = useState<Set<string>>(new Set())
  const [favoriteBusy, setFavoriteBusy] = useState(false)
  const [artError, setArtError] = useState<string | null>(null)
  const [launchError, setLaunchError] = useState<string | null>(null)
  const [refreshState, setRefreshState] = useState<'idle' | 'success' | 'error'>('idle')
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null)
  const { settings, loading: settingsLoading } = useSettings()
  const owner = settings.githubOwner?.trim()
  const { state, loadRepositories, refreshRepositories, loadMore } = useOwnerRepositories(owner)
  const {
    checkingUpdates,
    getInstalledApp,
    getLatestVersion,
    refreshInstalledApps,
    refreshLatestVersions,
  } = useLibraryStatus(state.repositories)

  const handleRefresh = async () => {
    setRefreshState('idle')
    const freshRepositories = await refreshRepositories()
    const freshInstalledApps = await refreshInstalledApps()

    if (!freshRepositories) {
      setRefreshState('error')
      return
    }

    await refreshLatestVersions(freshInstalledApps, freshRepositories)
    setLastRefreshedAt(new Date())
    setRefreshState('success')
  }

  const formattedRefreshTime = lastRefreshedAt
    ? lastRefreshedAt.toLocaleTimeString(language === 'en' ? 'en-US' : 'uk-UA', {
      hour: '2-digit',
      minute: '2-digit',
    })
    : null

  useEffect(() => {
    if (!settingsLoading) {
      loadRepositories(1)
    }
  }, [settingsLoading, loadRepositories])

  useEffect(() => {
    listProjectArt()
      .then((items) => {
        setProjectArtState(Object.fromEntries(
          items.map((item) => [projectArtKey(item.owner, item.repo), item]),
        ))
      })
      .catch(() => {})
  }, [])

  const loadFavorites = async () => {
    const favorites = await getFavorites()
    setFavoriteKeys(new Set(favorites.map((item) => projectArtKey(item.owner, item.repo))))
  }

  useEffect(() => {
    loadFavorites().catch(() => {})
  }, [])

  const visibleRepositories = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    const filtered = state.repositories.filter((repo) => {
      const installedApp = getInstalledApp(repo)
      const latestVersion = getLatestVersion(repo)
      const isFavorite = favoriteKeys.has(projectArtKey(repo.owner.login, repo.name))
      const hasUpdate = Boolean(
        installedApp &&
        latestVersion &&
        latestVersion !== installedApp.activeVersion,
      )

      if (filter === 'installed' && !installedApp) return false
      if (filter === 'favorites' && !isFavorite) return false
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
  }, [favoriteKeys, filter, getInstalledApp, getLatestVersion, query, sort, state.repositories])

  useEffect(() => {
    if (visibleRepositories.length === 0) {
      setFeaturedRepo(null)
      return
    }

    if (
      !featuredRepo ||
      !visibleRepositories.some((repo) => repo.id === featuredRepo.id)
    ) {
      setFeaturedRepo(visibleRepositories[0])
    }
  }, [featuredRepo, visibleRepositories])

  const featuredArt = featuredRepo
    ? projectArt[projectArtKey(featuredRepo.owner.login, featuredRepo.name)]
    : undefined
  const featuredCover = projectArtCoverUrl(featuredArt)

  const handleLaunch = async (repo: GitHubSearchResult) => {
    setLaunchError(null)
    try {
      await launchApp(repo.owner.login, repo.name)
    } catch (err) {
      setLaunchError(err instanceof Error ? err.message : t('library.launchError'))
    }
  }

  const handlePickArt = async (kind: 'cover', targetRepo = featuredRepo) => {
    if (!targetRepo) return

    setArtError(null)
    const imagePath = await pickImageFile()
    if (!imagePath) return

    try {
      const updatedArt = await setProjectArt(
        targetRepo.owner.login,
        targetRepo.name,
        kind,
        imagePath,
      )
      setProjectArtState((current) => ({
        ...current,
        [projectArtKey(targetRepo.owner.login, targetRepo.name)]: updatedArt,
      }))
    } catch {
      setArtError(t('art.saveError'))
    }
  }

  const handleClearArt = async (targetRepo = featuredRepo) => {
    if (!targetRepo) return

    setArtError(null)
    try {
      const updatedArt = await clearProjectArt(
        targetRepo.owner.login,
        targetRepo.name,
        'cover',
      )
      setProjectArtState((current) => ({
        ...current,
        [projectArtKey(targetRepo.owner.login, targetRepo.name)]: updatedArt,
      }))
    } catch {
      setArtError(t('art.clearError'))
    }
  }

  const handleFavoriteChange = (repo: GitHubSearchResult, nextValue: boolean) => {
    const key = projectArtKey(repo.owner.login, repo.name)
    setFavoriteKeys((current) => {
      const next = new Set(current)
      if (nextValue) {
        next.add(key)
      } else {
        next.delete(key)
      }
      return next
    })
  }

  const handleToggleFeaturedFavorite = async () => {
    if (!featuredRepo) return

    const key = projectArtKey(featuredRepo.owner.login, featuredRepo.name)
    const isFavorite = favoriteKeys.has(key)
    setFavoriteBusy(true)

    try {
      if (isFavorite) {
        await removeFromFavorites(featuredRepo.owner.login, featuredRepo.name)
        handleFavoriteChange(featuredRepo, false)
      } else {
        await addToFavorites(
          featuredRepo.owner.login,
          featuredRepo.name,
          featuredRepo.name,
          featuredRepo.description ?? undefined,
        )
        handleFavoriteChange(featuredRepo, true)
      }
    } catch {
      setArtError(t('art.saveError'))
    } finally {
      setFavoriteBusy(false)
    }
  }

  const renderHero = () => {
    if (!featuredRepo) return null

    const installedApp = getInstalledApp(featuredRepo)
    const latestVersion = getLatestVersion(featuredRepo)
    const hasUpdate = Boolean(
      installedApp &&
      latestVersion &&
      latestVersion !== installedApp.activeVersion,
    )
    const isInstalled = Boolean(installedApp)
    const isFavorite = favoriteKeys.has(projectArtKey(featuredRepo.owner.login, featuredRepo.name))
    const statusClass = hasUpdate ? 'update' : isInstalled ? 'installed' : 'available'
    const statusLabel = hasUpdate
      ? t('repo.update')
      : isInstalled
        ? t('repo.installed')
        : t('repo.available')
    const primaryLabel = hasUpdate
      ? t('repo.updateAction')
      : isInstalled
        ? t('repo.launch')
        : t('repo.install')
    const primaryAction = isInstalled && !hasUpdate
      ? () => handleLaunch(featuredRepo)
      : () => setSelectedRepo(featuredRepo)
    const handleOpenFolder = () => {
      openInstalledAppDir(featuredRepo.owner.login, featuredRepo.name)
        .catch((err) => setLaunchError(
          err instanceof Error ? err.message : t('installed.openFolderError'),
        ))
    }

    return (
      <section className="library-hero" aria-label={featuredRepo.name}>
        <div className="library-hero-cover">
          {featuredCover ? (
            <img src={featuredCover} alt="" />
          ) : (
            <img src={featuredRepo.owner.avatar_url} alt="" />
          )}
        </div>

        <div className="library-hero-main">
          <div className="repo-status-row">
            <span className={`repo-status ${statusClass}`}>{statusLabel}</span>
            {featuredRepo.language && <span className="repo-lang">{featuredRepo.language}</span>}
            <button
              type="button"
              className={`hero-favorite-btn ${isFavorite ? 'active' : ''}`}
              onClick={handleToggleFeaturedFavorite}
              disabled={favoriteBusy}
              title={isFavorite ? t('repo.removeFavorite') : t('repo.addFavorite')}
              aria-label={isFavorite ? t('repo.removeFavorite') : t('repo.addFavorite')}
            >
              {isFavorite ? '\u2605' : '\u2606'}
            </button>
          </div>
          <h2>{featuredRepo.name}</h2>
          <p className="library-hero-repo">{featuredRepo.owner.login}/{featuredRepo.name}</p>
          {featuredRepo.description && (
            <p className="library-hero-description">{featuredRepo.description}</p>
          )}
          <div className="library-hero-meta">
            <span>{t('repo.stars', { count: featuredRepo.stargazers_count.toLocaleString() })}</span>
            {installedApp && (
              <span>{t('repo.active', { version: installedApp.activeVersion })}</span>
            )}
            {hasUpdate && latestVersion && (
              <span>{t('repo.new', { version: latestVersion })}</span>
            )}
          </div>
          {artError && <p className="library-hero-error">{artError}</p>}
        </div>

        <div className="library-hero-actions">
          <button type="button" className="hero-primary-btn" onClick={primaryAction}>
            {primaryLabel}
          </button>
          <button type="button" className="secondary-btn" onClick={() => setSelectedRepo(featuredRepo)}>
            {t('repo.versions')}
          </button>
          {isInstalled && (
            <button type="button" className="secondary-btn" onClick={handleOpenFolder}>
              {t('installed.folder')}
            </button>
          )}
          <details className="project-actions-menu hero-actions-menu">
            <summary className="project-actions-trigger" aria-label={t('projectActions.open')}>
              ...
            </summary>
            <div className="project-actions-popover" aria-label={t('art.actions')}>
              <button type="button" onClick={() => onChangeLauncherBackground?.()}>
                {t('art.changeLauncherBackground')}
              </button>
              <button type="button" onClick={() => handlePickArt('cover')}>
                {t('art.changeCover')}
              </button>
              {featuredArt?.coverPath && (
                <button type="button" onClick={() => handleClearArt()}>
                  {t('art.resetCover')}
                </button>
              )}
              {hasLauncherBackground && (
                <button type="button" onClick={() => onClearLauncherBackground?.()}>
                  {t('art.resetLauncherBackground')}
                </button>
              )}
            </div>
          </details>
        </div>
      </section>
    )
  }

  const showLoadingState = owner && state.loading && state.repositories.length === 0

  return (
    <div className="page library-page">
      <div className="page-header">
        <h2>{t('library.title')}</h2>
        {owner && (
          <div className="page-actions">
            {refreshState === 'success' && formattedRefreshTime && (
              <span className="refresh-status success">
                {t('refresh.updatedAt', { time: formattedRefreshTime })}
              </span>
            )}
            {refreshState === 'error' && (
              <span className="refresh-status error">{t('refresh.error')}</span>
            )}
            <button
              type="button"
              className="refresh-btn"
              onClick={handleRefresh}
              disabled={state.loading || checkingUpdates}
            >
              {state.loading || checkingUpdates ? t('library.refreshing') : t('library.refresh')}
            </button>
          </div>
        )}
      </div>

      {!owner && !settingsLoading && (
        <StatePanel
          kind="empty"
          title={t('library.noOwnerTitle')}
          message={t('library.noOwnerText')}
        />
      )}

      {owner && (
        <>
          {renderHero()}

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
              {(['all', 'installed', 'favorites', 'updates', 'available'] as LibraryFilter[]).map((item) => (
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
            <StatePanel
              kind="error"
              title={t('state.githubErrorTitle')}
              message={t('state.githubErrorText')}
              details={state.error}
              detailsLabel={t('state.details')}
              actionLabel={t('library.tryAgain')}
              onAction={handleRefresh}
            />
          )}

          {launchError && (
            <StatePanel
              kind="error"
              title={t('state.launchErrorTitle')}
              message={launchError}
            />
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
              <StatePanel kind="loading" title={t('library.loading')} skeletonCount={3} />
            )}

            {visibleRepositories.length === 0 && !state.loading && (
              <StatePanel
                kind="empty"
                title={state.repositories.length === 0
                  ? t('library.emptyTitle')
                  : t('library.noMatchesTitle')}
                message={state.repositories.length === 0
                  ? t('library.emptyText')
                  : t('library.noMatchesText')}
                actionLabel={state.repositories.length === 0 ? t('library.refresh') : undefined}
                onAction={state.repositories.length === 0 ? handleRefresh : undefined}
              />
            )}

            {visibleRepositories.map((repo) => (
              <RepoCard
                key={repo.id}
                repo={repo}
                installedApp={getInstalledApp(repo)}
                latestVersion={getLatestVersion(repo)}
                art={projectArt[projectArtKey(repo.owner.login, repo.name)]}
                isFavorite={favoriteKeys.has(projectArtKey(repo.owner.login, repo.name))}
                isSelected={featuredRepo?.id === repo.id}
                onPreview={() => setFeaturedRepo(repo)}
                onFavoriteChange={(nextValue) => handleFavoriteChange(repo, nextValue)}
                onPickArt={() => handlePickArt('cover', repo)}
                onClearArt={() => handleClearArt(repo)}
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
          currentVersion={getInstalledApp(selectedRepo)?.activeVersion}
          onClose={() => setSelectedRepo(null)}
          onInstalled={refreshInstalledApps}
        />
      )}
    </div>
  )
}

export default SearchPage
