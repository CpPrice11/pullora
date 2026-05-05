import { useEffect, useState } from 'react'
import { InstalledApp } from '../types'
import './PageStyles.css'

function InstalledPage() {
  const [apps] = useState<InstalledApp[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // TODO: Load installed apps from storage
    setLoading(false)
  }, [])

  return (
    <div className="page">
      <h2>Installed Applications</h2>

      <div className="apps-list">
        {loading && <p>Loading installed apps...</p>}

        {!loading && apps.length === 0 && (
          <div className="empty-state">
            <p>No applications installed yet</p>
            <p>Go to Search tab to find and install applications</p>
          </div>
        )}

        {apps.map((app) => (
          <div key={`${app.owner}/${app.repo}`} className="app-card">
            <div className="app-header">
              <h3>{app.name}</h3>
              <span className="version-badge">{app.activeVersion}</span>
            </div>
            <p className="app-repo">{app.owner}/{app.repo}</p>
            <div className="app-actions">
              <button>Launch</button>
              <button>Update</button>
              <button>Versions</button>
              <button>Uninstall</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default InstalledPage
