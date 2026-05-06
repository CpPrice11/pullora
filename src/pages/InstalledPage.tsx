import { useCallback, useEffect, useState } from 'react'
import type { InstalledApp } from '../types'
import {
  cleanupIncompleteInstalls,
  getInstalledApps,
  launchApp,
  openInstalledAppDir,
  switchVersion,
  uninstallVersion,
  validateInstalledApp,
} from '../services/installed'
import DownloadProgressPanel from '../components/Install/DownloadProgress'
import ReleaseSelector from '../components/Search/ReleaseSelector'
import { useDownload } from '../hooks/useDownload'
import './PageStyles.css'

function InstalledPage() {
  const [apps, setApps] = useState<InstalledApp[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedApp, setExpandedApp] = useState<string | null>(null)
  const [repairTarget, setRepairTarget] = useState<InstalledApp | null>(null)
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
    if (!confirm(`Видалити ${repo} ${tag}?`)) return
    await uninstallVersion(owner, repo, tag)
    loadApps()
  }

  const handleLaunch = async (app: InstalledApp) => {
    setError(null)
    try {
      const health = await validateInstalledApp(app.owner, app.repo)
      if (!health.ok) {
        setError(health.message)
        setRepairTarget(app)
        return
      }
      await launchApp(app.owner, app.repo)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не вдалося запустити застосунок')
      setRepairTarget(app)
    }
  }

  const handleCleanup = async () => {
    setError(null)
    try {
      const removed = await cleanupIncompleteInstalls()
      alert(removed > 0 ? `Очищено незавершених папок: ${removed}` : 'Незавершених встановлень не знайдено')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не вдалося очистити незавершені встановлення')
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2>Встановлені</h2>
        <div className="page-actions">
          <button type="button" className="secondary-btn" onClick={handleCleanup}>
            Очистити незавершені
          </button>
          <button onClick={loadApps} className="refresh-btn">Оновити</button>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          {repairTarget && (
            <button type="button" onClick={() => setRepairTarget(repairTarget)}>
              Відновити
            </button>
          )}
        </div>
      )}

      <DownloadProgressPanel downloads={downloads} onCancel={cancel} />

      <div className="apps-list">
        {loading && (
          <div className="library-skeleton" aria-label="Завантажуємо встановлені">
            <div className="skeleton-card" />
            <div className="skeleton-card" />
          </div>
        )}

        {!loading && apps.length === 0 && (
          <div className="empty-state">
            <h3>Встановлених застосунків немає</h3>
            <p>Встанови проєкт із бібліотеки, і він зʼявиться тут.</p>
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
                <button onClick={() => handleLaunch(app)}>
                  Запустити
                </button>
                <button className="secondary-btn" onClick={() => setRepairTarget(app)}>
                  Відновити
                </button>
                <button
                  className="secondary-btn"
                  onClick={() => openInstalledAppDir(app.owner, app.repo).catch((err) =>
                    setError(err instanceof Error ? err.message : 'Не вдалося відкрити папку'),
                  )}
                >
                  Папка
                </button>
                <button
                  onClick={() => setExpandedApp(isExpanded ? null : key)}
                  className="secondary-btn"
                >
                  {isExpanded ? 'Сховати' : `Версії (${app.versions.length})`}
                </button>
              </div>

              {isExpanded && (
                <div className="version-list">
                  {app.versions.map((version) => (
                    <div
                      key={version.tag}
                      className={`version-row ${version.tag === app.activeVersion ? 'active' : ''}`}
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

      {repairTarget && (
        <ReleaseSelector
          owner={repairTarget.owner}
          repo={repairTarget.repo}
          displayName={repairTarget.name}
          onClose={() => setRepairTarget(null)}
          onInstalled={() => {
            setRepairTarget(null)
            loadApps()
          }}
        />
      )}
    </div>
  )
}

export default InstalledPage
