import { useEffect, useState, useCallback } from 'react'
import type { FavoriteApp } from '../types'
import { getFavorites, removeFromFavorites } from '../services/favorites'
import ReleaseSelector from '../components/Search/ReleaseSelector'
import './PageStyles.css'

function FavoritesPage() {
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
        <h2>Обране</h2>
        <button onClick={loadFavorites} className="refresh-btn">Оновити</button>
      </div>

      <div className="apps-list">
        {loading && (
          <div className="library-skeleton" aria-label="Завантажуємо обране">
            <div className="skeleton-card" />
            <div className="skeleton-card" />
          </div>
        )}

        {!loading && favorites.length === 0 && (
          <div className="empty-state">
            <h3>Обраних застосунків немає</h3>
            <p>Додай проєкт у бібліотеці, щоб він зʼявився тут.</p>
          </div>
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
                title="Прибрати з обраного"
                aria-label="Прибрати з обраного"
              >
                ★
              </button>
            </div>

            {fav.description && (
              <p className="app-description">{fav.description}</p>
            )}

            <div className="app-actions">
              <button onClick={() => setSelectedFav(fav)}>
                Встановити / оновити
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
