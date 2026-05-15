import { useEffect, useState, useCallback } from 'react'
import type { FavoriteApp } from '../types'
import { getFavorites, removeFromFavorites } from '../services/favorites'
import ReleaseSelector from '../components/Search/ReleaseSelector'
import StatePanel from '../components/State/StatePanel'
import { useI18n } from '../i18n'
import './PageStyles.css'

function FavoritesPage() {
  const { t } = useI18n()
  const [favorites, setFavorites] = useState<FavoriteApp[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedFav, setSelectedFav] = useState<FavoriteApp | null>(null)

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

  const handleRemove = async (fav: FavoriteApp) => {
    await removeFromFavorites(fav.owner, fav.repo)
    loadFavorites()
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2>{t('favorites.title')}</h2>
        <button onClick={loadFavorites} className="refresh-btn">{t('favorites.refresh')}</button>
      </div>

      <div className="apps-list">
        {loading && (
          <StatePanel kind="loading" title={t('favorites.loading')} skeletonCount={2} />
        )}

        {!loading && favorites.length === 0 && (
          <StatePanel
            kind="empty"
            title={t('favorites.emptyTitle')}
            message={t('favorites.emptyText')}
          />
        )}

        {favorites.map((fav) => (
          <div key={`${fav.owner}/${fav.repo}`} className="app-card">
            <div className="app-header">
              <div>
                <h3>{fav.displayName}</h3>
                <p className="app-repo">{fav.owner}/{fav.repo}</p>
              </div>
              <button
                className="fav-remove-btn"
                onClick={() => handleRemove(fav)}
                title={t('repo.removeFavorite')}
                aria-label={t('repo.removeFavorite')}
              >
                ★
              </button>
            </div>

            {fav.description && (
              <p className="app-description">{fav.description}</p>
            )}

            <div className="app-actions">
              <button onClick={() => setSelectedFav(fav)}>
                {t('favorites.installUpdate')}
              </button>
            </div>
          </div>
        ))}
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
