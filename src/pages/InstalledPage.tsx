import { useEffect, useState, useCallback } from 'react'
import type { InstalledApp } from '../types'
import { getInstalledApps, switchVersion, uninstallVersion, launchApp } from '../services/installed'
import DownloadProgressPanel from '../components/Install/DownloadProgress'
import { useDownload } from '../hooks/useDownload'
import './PageStyles.css'

function InstalledPage() {
  const [apps, setApps] = useState<InstalledApp[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedApp, setExpandedApp] = useState<string | null>(null)
  const { downloads, cancel } = useDownload()

  const loadApps = useCallback(async () => {
    try {
      const data = await getInstalledApps()
      setApps(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load installed apps')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadApps() }, [loadApps])

  const handleSwitch = async (owner: string, repo: string, tag: string) => {
    await switchVersion(owner, repo, tag)
    loadApps()
  }

  const handleUninstall = async (owner: string, repo: string, tag: string) => {
    if (!confirm(`Uninstall ${repo} version ${tag}?`)) return
    await uninstallVersion(owner, repo, tag)
    loadApps()
  }

  const handleLaunch = async (owner: string, repo: string) => {
    try {
      await launchApp(owner, repo)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to launch app')
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2>Installed Applications</h2>
        <button onClick={loadApps} className="refresh-btn">↻ Refresh</button>
      </div>

      {error && <div className="error-banner">⚠ {error}</div>}

      <DownloadProgressPanel downloads={downloads} onCancel={cancel} />

      <div className="apps-list">
        {loading && <p>Loading installed apps...</p>}

        {!loading && apps.length === 0 && (
          <div className="empty-state">
            <p>No applications installed yet</p>
            <p>Go to Search to find and install applications from GitHub</p>
          </div>
        )}

        {apps.map((app) => {
          const key = `${app.owner}/${app.repo}`
          const isExpanded = expandedApp === key
          return (
            <div key={key} className="app-card">
              <div className="app-header">
                <div>
                  <h3>{app.name}</h3>
                  <p className="app-repo">{app.owner}/{app.repo}</p>
                </div>
                <span className="version-badge">{app.activeVersion}</span>
              </div>

              <div className="app-actions">
                <button onClick={() => handleLaunch(app.owner, app.repo)}>
                  ▶ Launch
                </button>
                <button
                  onClick={() => setExpandedApp(isExpanded ? null : key)}
                  className="secondary-btn"
                >
                  {isExpanded ? 'Hide Versions' : `Versions (${app.versions.length})`}
                </button>
              </div>

              {isExpanded && (
                <div className="version-list">
                  {app.versions.map((v) => (
                    <div key={v.tag} className={`version-row ${v.tag === app.activeVersion ? 'active' : ''}`}>
                      <span className="version-tag">{v.tag}</span>
                      <span className="version-size">{(v.sizeBytes / 1024 / 1024).toFixed(1)} MB</span>
                      <div className="version-actions">
                        {v.tag !== app.activeVersion && (
                          <button
                            className="small-btn"
                            onClick={() => handleSwitch(app.owner, app.repo, v.tag)}
                          >
                            Switch
                          </button>
                        )}
                        {v.tag === app.activeVersion && (
                          <span className="active-label">Active</span>
                        )}
                        <button
                          className="small-btn danger"
                          onClick={() => handleUninstall(app.owner, app.repo, v.tag)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default InstalledPage
