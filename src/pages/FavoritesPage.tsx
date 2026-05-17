import { useEffect, useState, useCallback } from 'react'
import type { FavoriteApp, ProjectArt } from '../types'
import { getFavorites, removeFromFavorites } from '../services/favorites'
import { getInstalledApps, launchApp } from '../services/installed'
import { pickImageFile } from '../services/dialog'
import {
  clearProjectArt,
  listProjectArt,
  projectArtBackgroundUrl,
  projectArtCoverUrl,
  projectArtKey,
  setProjectArt as saveProjectArt,
} from '../services/projectArt'
import ReleaseSelector from '../components/Search/ReleaseSelector'
import StatePanel from '../components/State/StatePanel'
import { useI18n } from '../i18n'
import './PageStyles.css'

interface FavoritesPageProps {
  onBackgroundChange?: (url: string | null) => void
}

function FavoritesPage({ onBackgroundChange }: FavoritesPageProps) {
  const { t } = useI18n()
  const [favorites, setFavorites] = useState<FavoriteApp[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedFav, setSelectedFav] = useState<FavoriteApp | null>(null)
  const [featuredKey, setFeaturedKey] = useState<string | null>(null)
  const [projectArt, setProjectArt] = useState<Record<string, ProjectArt>>({})
  const [artError, setArtError] = useState<string | null>(null)
  const [installedKeys, setInstalledKeys] = useState<Set<string>>(new Set())
  const [actionError, setActionError] = useState<string | null>(null)

  const loadFavorites = useCallback(async () => {
    try {
      const data = await getFavorites()
      setFavorites(data)
    } catch {
      // Browser preview fallback.
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadFavorites()
  }, [loadFavorites])

  useEffect(() => {
    listProjectArt()
      .then((items) => setProjectArt(Object.fromEntries(
        items.map((item) => [projectArtKey(item.owner, item.repo), item]),
      )))
      .catch(() => {})
  }, [])

  useEffect(() => {
    getInstalledApps()
      .then((items) => setInstalledKeys(new Set(
        items.map((app) => projectArtKey(app.owner, app.repo)),
      )))
      .catch(() => setInstalledKeys(new Set()))
  }, [])

  useEffect(() => {
    if (favorites.length === 0) {
      setFeaturedKey(null)
      onBackgroundChange?.(null)
      return
    }

    if (!featuredKey || !favorites.some((fav) => `${fav.owner}/${fav.repo}` === featuredKey)) {
      setFeaturedKey(`${favorites[0].owner}/${favorites[0].repo}`)
    }
  }, [favorites, featuredKey, onBackgroundChange])

  useEffect(() => {
    const favorite = favorites.find((fav) => `${fav.owner}/${fav.repo}` === featuredKey)
    if (!favorite) return
    const art = projectArt[projectArtKey(favorite.owner, favorite.repo)]
    onBackgroundChange?.(projectArtBackgroundUrl(art))
  }, [favorites, featuredKey, onBackgroundChange, projectArt])

  const handleRemove = async (fav: FavoriteApp) => {
    await removeFromFavorites(fav.owner, fav.repo)
    loadFavorites()
  }

  const isInstalledFavorite = (fav: FavoriteApp) => installedKeys.has(projectArtKey(fav.owner, fav.repo))

  const handlePrimaryAction = async (fav: FavoriteApp) => {
    setActionError(null)
    if (!isInstalledFavorite(fav)) {
      setSelectedFav(fav)
      return
    }

    try {
      await launchApp(fav.owner, fav.repo)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('installed.launchError'))
      setSelectedFav(fav)
    }
  }

  const saveArtForFavorite = async (fav: FavoriteApp, kind: 'cover' | 'background') => {
    setArtError(null)
    const imagePath = await pickImageFile()
    if (!imagePath) return

    try {
      const updatedArt = await saveProjectArt(fav.owner, fav.repo, kind, imagePath)
      setProjectArt((current) => ({
        ...current,
        [projectArtKey(fav.owner, fav.repo)]: updatedArt,
      }))
    } catch {
      setArtError(t('art.saveError'))
    }
  }

  const handlePickArt = async (
    event: React.MouseEvent,
    fav: FavoriteApp,
    kind: 'cover' | 'background',
  ) => {
    event.stopPropagation()
    await saveArtForFavorite(fav, kind)
  }

  const clearArtForFavorite = async (fav: FavoriteApp) => {
    setArtError(null)

    try {
      const updatedArt = await clearProjectArt(fav.owner, fav.repo, 'all')
      setProjectArt((current) => ({
        ...current,
        [projectArtKey(fav.owner, fav.repo)]: updatedArt,
      }))
    } catch {
      setArtError(t('art.clearError'))
    }
  }

  const handleClearArt = async (event: React.MouseEvent, fav: FavoriteApp) => {
    event.stopPropagation()
    await clearArtForFavorite(fav)
  }

  const handleCardKeyDown = (event: React.KeyboardEvent, key: string) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    setFeaturedKey(key)
  }

  const featuredFavorite = favorites.find((fav) => `${fav.owner}/${fav.repo}` === featuredKey) ?? favorites[0]
  const featuredArt = featuredFavorite
    ? projectArt[projectArtKey(featuredFavorite.owner, featuredFavorite.repo)]
    : undefined
  const featuredCoverUrl = projectArtCoverUrl(featuredArt)

  return (
    <div className="page">
      <div className="page-header">
        <h2>{t('favorites.title')}</h2>
        <button type="button" onClick={loadFavorites} className="refresh-btn">
          {t('favorites.refresh')}
        </button>
      </div>

      <div className="apps-list">
        {loading && (
          <StatePanel kind="loading" title={t('favorites.loading')} skeletonCount={2} />
        )}

        {artError && (
          <StatePanel
            kind="error"
            title={t('state.settingsErrorTitle')}
            message={artError}
          />
        )}

        {actionError && (
          <StatePanel
            kind="error"
            title={t('state.launchErrorTitle')}
            message={actionError}
          />
        )}

        {!loading && favorites.length === 0 && (
          <StatePanel
            kind="empty"
            title={t('favorites.emptyTitle')}
            message={t('favorites.emptyText')}
          />
        )}

        {featuredFavorite && !loading && (
          <section className="library-hero favorites-hero">
            <div className="library-hero-cover">
              {featuredCoverUrl ? (
                <img src={featuredCoverUrl} alt="" />
              ) : (
                <span>{featuredFavorite.displayName.slice(0, 1).toUpperCase()}</span>
              )}
            </div>
            <div className="library-hero-main">
              <div className="repo-status-row">
                <span className="repo-status installed">{t('favorites.title')}</span>
              </div>
              <h2 title={featuredFavorite.displayName}>{featuredFavorite.displayName}</h2>
              <p className="library-hero-repo">{featuredFavorite.owner}/{featuredFavorite.repo}</p>
              {featuredFavorite.description && (
                <p className="library-hero-description">{featuredFavorite.description}</p>
              )}
            </div>
            <div className="library-hero-actions">
              <button type="button" className="hero-primary-btn" onClick={() => handlePrimaryAction(featuredFavorite)}>
                {isInstalledFavorite(featuredFavorite) ? t('installed.launch') : t('favorites.installUpdate')}
              </button>
              <button type="button" className="secondary-btn" onClick={() => handleRemove(featuredFavorite)}>
                {t('repo.removeFavorite')}
              </button>
              <div className="hero-art-actions">
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => saveArtForFavorite(featuredFavorite, 'background')}
                >
                  {t('art.background')}
                </button>
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => saveArtForFavorite(featuredFavorite, 'cover')}
                >
                  {t('art.cover')}
                </button>
                {(featuredArt?.backgroundPath || featuredArt?.coverPath) && (
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => clearArtForFavorite(featuredFavorite)}
                  >
                    {t('art.clear')}
                  </button>
                )}
              </div>
            </div>
          </section>
        )}

        {favorites.map((fav) => {
          const key = `${fav.owner}/${fav.repo}`
          const art = projectArt[projectArtKey(fav.owner, fav.repo)]
          const coverUrl = projectArtCoverUrl(art)

          return (
            <div
              key={key}
              className={`app-card cinematic-app-card ${featuredKey === key ? 'selected' : ''}`}
              onClick={() => setFeaturedKey(key)}
              onKeyDown={(event) => handleCardKeyDown(event, key)}
              role="button"
              tabIndex={0}
              aria-label={`${fav.displayName}, ${fav.owner}/${fav.repo}`}
            >
              <div className="app-header">
                <div className="app-cover" aria-hidden="true">
                  {coverUrl ? <img src={coverUrl} alt="" /> : <span>{fav.displayName.slice(0, 1).toUpperCase()}</span>}
                </div>
                <div className="app-title-block">
                  <h3 title={fav.displayName}>{fav.displayName}</h3>
                  <p className="app-repo">{fav.owner}/{fav.repo}</p>
                </div>
                <button
                  type="button"
                  className="fav-remove-btn"
                  onClick={(event) => {
                    event.stopPropagation()
                    handleRemove(fav)
                  }}
                  title={t('repo.removeFavorite')}
                  aria-label={t('repo.removeFavorite')}
                >
                  {'\u2605'}
                </button>
              </div>

              {fav.description && (
                <p className="app-description">{fav.description}</p>
              )}

              <div className="app-actions">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    handlePrimaryAction(fav)
                  }}
                >
                  {isInstalledFavorite(fav) ? t('installed.launch') : t('favorites.installUpdate')}
                </button>
                {featuredKey === key && (
                  <>
                    <button
                      type="button"
                      className="secondary-btn art-mini-btn"
                      onClick={(event) => handlePickArt(event, fav, 'background')}
                    >
                      {t('art.background')}
                    </button>
                    <button
                      type="button"
                      className="secondary-btn art-mini-btn"
                      onClick={(event) => handlePickArt(event, fav, 'cover')}
                    >
                      {t('art.cover')}
                    </button>
                    {(art?.backgroundPath || art?.coverPath) && (
                      <button
                        type="button"
                        className="secondary-btn art-mini-btn"
                        onClick={(event) => handleClearArt(event, fav)}
                      >
                        {t('art.clear')}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {selectedFav && (
        <ReleaseSelector
          owner={selectedFav.owner}
          repo={selectedFav.repo}
          displayName={selectedFav.displayName}
          description={selectedFav.description}
          onClose={() => setSelectedFav(null)}
        />
      )}
    </div>
  )
}

export default FavoritesPage
