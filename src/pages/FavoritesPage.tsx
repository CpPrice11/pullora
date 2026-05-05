import { useEffect, useState } from 'react'
import { FavoriteApp } from '../types'
import './PageStyles.css'

function FavoritesPage() {
  const [favorites] = useState<FavoriteApp[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // TODO: Load favorites from storage
    setLoading(false)
  }, [])

  return (
    <div className="page">
      <h2>Favorite Applications</h2>

      <div className="apps-list">
        {loading && <p>Loading favorites...</p>}

        {!loading && favorites.length === 0 && (
          <div className="empty-state">
            <p>No favorite applications yet</p>
            <p>Add applications to your favorites for quick access</p>
          </div>
        )}

        {favorites.map((fav) => (
          <div key={`${fav.owner}/${fav.repo}`} className="app-card">
            <div className="app-header">
              <h3>{fav.displayName}</h3>
              <button className="favorite-btn" title="Remove from favorites">
                ⭐
              </button>
            </div>
            <p className="app-repo">{fav.owner}/{fav.repo}</p>
            {fav.description && (
              <p className="app-description">{fav.description}</p>
            )}
            <div className="app-actions">
              <button>Install Latest</button>
              <button>Check Updates</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default FavoritesPage
