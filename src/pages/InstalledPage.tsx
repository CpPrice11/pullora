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
    setError(null)
    try {
      const data = await getInstalledApps()
      setApps(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не вдалося завантажити встановлені застосунки')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadApps()
  }, [loadApps])

  const handleSwitch = async (owner: string, repo: string, tag: string) => {
    await switchVersion(owner, repo, tag)
    loadApps()
  }

  const handleUninstall = async (owner: string, repo: string, tag: string) => {
    if (!confirm(`Видалити ${repo} версії ${tag}?`)) return
    await uninstallVersion(owner, repo, tag)
    loadApps()
  }

  const handleLaunch = async (owner: string, repo: string) => {
    try {
      await launchApp(owner, repo)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Не вдалося запустити застосунок')
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2>Встановлені застосунки</h2>
        <button onClick={loadApps} className="refresh-btn">Оновити</button>
      </div>

      {error && <div className="error-banner">Увага: {error}</div>}

      <DownloadProgressPanel downloads={downloads} onCancel={cancel} />

      <div className="apps-list">
        {loading && <p>Завантажуємо встановлені застосунки...</p>}

        {!loading && apps.length === 0 && (
          <div className="empty-state">
            <p>Поки що немає встановлених застосунків</p>
            <p>Перейди в Бібліотеку, щоб знайти й встановити застосунки з GitHub</p>
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
                  Запустити
                </button>
                <button
                  onClick={() => setExpandedApp(isExpanded ? null : key)}
                  className="secondary-btn"
                >
                  {isExpanded ? 'Сховати версії' : `Версії (${app.versions.length})`}
                </button>
              </div>

              {isExpanded && (
                <div className="version-list">
                  {app.versions.map((version) => (
                    <div
                      key={version.tag}
                      className={`version-row ${
                        version.tag === app.activeVersion ? 'active' : ''
                      }`}
                    >
                      <span className="version-tag">{version.tag}</span>
                      <span className="version-size">
                        {(version.sizeBytes / 1024 / 1024).toFixed(1)} MB
                      </span>
                      <div className="version-actions">
                        {version.tag !== app.activeVersion && (
                          <button
                            className="small-btn"
                            onClick={() => handleSwitch(app.owner, app.repo, version.tag)}
                          >
                            Активувати
                          </button>
                        )}
                        {version.tag === app.activeVersion && (
                          <span className="active-label">Активна</span>
                        )}
                        <button
                          className="small-btn danger"
                          onClick={() => handleUninstall(app.owner, app.repo, version.tag)}
                        >
                          Видалити
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
