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
      // Not running in Tauri — ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadFavorites() }, [loadFavorites])

  const handleRemove = async (fav: FavoriteApp) => {
    await removeFromFavorites(fav.owner, fav.repo)
    loadFavorites()
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2>Favorite Applications</h2>
        <button onClick={loadFavorites} className="refresh-btn">↻ Refresh</button>
      </div>

      <div className="apps-list">
        {loading && <p>Loading favorites...</p>}

        {!loading && favorites.length === 0 && (
          <div className="empty-state">
            <p>No favorite applications yet</p>
            <p>Star a repository in the Search tab to add it here</p>
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
                title="Remove from favorites"
              >
                ★
              </button>
            </div>

            {fav.description && (
              <p className="app-description">{fav.description}</p>
            )}

            <div className="app-actions">
              <button onClick={() => setSelectedFav(fav)}>
                ⬇ Install / Update
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
