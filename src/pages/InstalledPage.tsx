import { useCallback, useEffect, useState } from 'react'
import type { InstalledApp, InstalledAppHealth } from '../types'
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
import { useI18n } from '../i18n'
import './PageStyles.css'

type HealthMap = Record<string, InstalledAppHealth>

function appKey(app: InstalledApp) {
  return `${app.owner}/${app.repo}`
}

function InstalledPage() {
  const { t } = useI18n()
  const [apps, setApps] = useState<InstalledApp[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedApp, setExpandedApp] = useState<string | null>(null)
  const [repairTarget, setRepairTarget] = useState<InstalledApp | null>(null)
  const [healthByApp, setHealthByApp] = useState<HealthMap>({})
  const [checkingHealth, setCheckingHealth] = useState(false)
  const { downloads, cancel } = useDownload()

  const refreshHealth = useCallback(async (items: InstalledApp[]) => {
    if (items.length === 0) {
      setHealthByApp({})
      return
    }

    setCheckingHealth(true)
    try {
      const results = await Promise.all(items.map(async (app) => {
        try {
          const health = await validateInstalledApp(app.owner, app.repo)
          return [appKey(app), health] as const
        } catch (err) {
          return [appKey(app), {
            ok: false,
            status: 'needsRepair',
            message: err instanceof Error ? err.message : t('installed.healthRepair'),
            executablePath: null,
          } satisfies InstalledAppHealth] as const
        }
      }))
      setHealthByApp(Object.fromEntries(results))
    } finally {
      setCheckingHealth(false)
    }
  }, [t])

  const loadApps = useCallback(async () => {
    setError(null)
    try {
      const data = await getInstalledApps()
      setApps(data)
      await refreshHealth(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('installed.loadError'))
    } finally {
      setLoading(false)
    }
  }, [refreshHealth, t])

  useEffect(() => {
    loadApps()
  }, [loadApps])

  const handleSwitch = async (owner: string, repo: string, tag: string) => {
    await switchVersion(owner, repo, tag)
    await loadApps()
  }

  const handleUninstall = async (owner: string, repo: string, tag: string) => {
    if (!confirm(t('installed.uninstallConfirm', { repo, tag }))) return
    await uninstallVersion(owner, repo, tag)
    await loadApps()
  }

  const handleLaunch = async (app: InstalledApp) => {
    setError(null)
    try {
      const health = await validateInstalledApp(app.owner, app.repo)
      setHealthByApp((current) => ({
        ...current,
        [appKey(app)]: health,
      }))
      if (!health.ok) {
        setError(health.message)
        setRepairTarget(app)
        return
      }
      await launchApp(app.owner, app.repo)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('installed.launchError'))
      setRepairTarget(app)
    }
  }

  const handleCleanup = async () => {
    setError(null)
    try {
      const removed = await cleanupIncompleteInstalls()
      alert(removed > 0
        ? t('installed.cleanupDone', { count: removed })
        : t('installed.cleanupEmpty'))
      await loadApps()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('installed.cleanupError'))
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2>{t('installed.title')}</h2>
        <div className="page-actions">
          {checkingHealth && <span className="saved-indicator">{t('installed.checkingHealth')}</span>}
          <button type="button" className="secondary-btn" onClick={handleCleanup}>
            {t('installed.cleanup')}
          </button>
          <button onClick={loadApps} className="refresh-btn">{t('installed.refresh')}</button>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          {repairTarget && (
            <button type="button" onClick={() => setRepairTarget(repairTarget)}>
              {t('installed.repair')}
            </button>
          )}
        </div>
      )}

      <DownloadProgressPanel downloads={downloads} onCancel={cancel} />

      <div className="apps-list">
        {loading && (
          <div className="library-skeleton" aria-label={t('installed.loading')}>
            <div className="skeleton-card" />
            <div className="skeleton-card" />
          </div>
        )}

        {!loading && apps.length === 0 && (
          <div className="empty-state">
            <h3>{t('installed.emptyTitle')}</h3>
            <p>{t('installed.emptyText')}</p>
          </div>
        )}

        {apps.map((app) => {
          const key = appKey(app)
          const isExpanded = expandedApp === key
          const health = healthByApp[key]
          const needsRepair = health ? !health.ok : false
          return (
            <div key={key} className={`app-card ${needsRepair ? 'app-card--needs-repair' : ''}`}>
              <div className="app-header">
                <div>
                  <h3>{app.name}</h3>
                  <p className="app-repo">{app.owner}/{app.repo}</p>
                </div>
                <div className="app-card-badges">
                  <span className="version-badge">{app.activeVersion}</span>
                  {health && (
                    <span className={`health-badge ${needsRepair ? 'repair' : 'ready'}`}>
                      {needsRepair ? t('installed.healthRepair') : t('installed.healthReady')}
                    </span>
                  )}
                </div>
              </div>

              {needsRepair && health?.message && (
                <p className="app-health-message">{health.message}</p>
              )}

              <div className="app-actions">
                <button onClick={() => handleLaunch(app)}>
                  {t('installed.launch')}
                </button>
                {needsRepair && (
                  <button className="secondary-btn" onClick={() => setRepairTarget(app)}>
                    {t('installed.repair')}
                  </button>
                )}
                <button
                  className="secondary-btn"
                  onClick={() => openInstalledAppDir(app.owner, app.repo).catch((err) =>
                    setError(err instanceof Error ? err.message : t('installed.openFolderError')),
                  )}
                >
                  {t('installed.folder')}
                </button>
                <button
                  onClick={() => setExpandedApp(isExpanded ? null : key)}
                  className="secondary-btn"
                >
                  {isExpanded ? t('installed.hide') : t('installed.versions', { count: app.versions.length })}
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
                            {t('installed.activate')}
                          </button>
                        )}
                        {version.tag === app.activeVersion && (
                          <span className="active-label">{t('installed.active')}</span>
                        )}
                        <button
                          className="small-btn danger"
                          onClick={() => handleUninstall(app.owner, app.repo, version.tag)}
                        >
                          {t('installed.delete')}
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
            setError(null)
            loadApps()
          }}
        />
      )}
    </div>
  )
}

export default InstalledPage
