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
import { pickImageFile } from '../services/dialog'
import {
  clearProjectArt,
  listProjectArt,
  projectArtBackgroundUrl,
  projectArtCoverUrl,
  projectArtKey,
  setProjectArt as saveProjectArt,
} from '../services/projectArt'
import DownloadProgressPanel from '../components/Install/DownloadProgress'
import ReleaseSelector from '../components/Search/ReleaseSelector'
import StatePanel from '../components/State/StatePanel'
import { useDownload } from '../hooks/useDownload'
import { useI18n } from '../i18n'
import type { ProjectArt } from '../types'
import './PageStyles.css'

type HealthMap = Record<string, InstalledAppHealth>

function appKey(app: InstalledApp) {
  return `${app.owner}/${app.repo}`
}

interface InstalledPageProps {
  onBackgroundChange?: (url: string | null) => void
}

function InstalledPage({ onBackgroundChange }: InstalledPageProps) {
  const { t } = useI18n()
  const [apps, setApps] = useState<InstalledApp[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedApp, setExpandedApp] = useState<string | null>(null)
  const [repairTarget, setRepairTarget] = useState<InstalledApp | null>(null)
  const [healthByApp, setHealthByApp] = useState<HealthMap>({})
  const [selectedAppKey, setSelectedAppKey] = useState<string | null>(null)
  const [projectArt, setProjectArt] = useState<Record<string, ProjectArt>>({})
  const [artError, setArtError] = useState<string | null>(null)
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

  useEffect(() => {
    listProjectArt()
      .then((items) => setProjectArt(Object.fromEntries(
        items.map((item) => [projectArtKey(item.owner, item.repo), item]),
      )))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (apps.length === 0) {
      setSelectedAppKey(null)
      onBackgroundChange?.(null)
      return
    }

    if (!selectedAppKey || !apps.some((app) => appKey(app) === selectedAppKey)) {
      setSelectedAppKey(appKey(apps[0]))
    }
  }, [apps, onBackgroundChange, selectedAppKey])

  useEffect(() => {
    const selected = apps.find((app) => appKey(app) === selectedAppKey)
    if (!selected) return
    const art = projectArt[projectArtKey(selected.owner, selected.repo)]
    onBackgroundChange?.(projectArtBackgroundUrl(art))
  }, [apps, onBackgroundChange, projectArt, selectedAppKey])

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

  const saveArtForApp = async (app: InstalledApp, kind: 'cover' | 'background') => {
    setArtError(null)
    const imagePath = await pickImageFile()
    if (!imagePath) return

    try {
      const updatedArt = await saveProjectArt(app.owner, app.repo, kind, imagePath)
      setProjectArt((current) => ({
        ...current,
        [projectArtKey(app.owner, app.repo)]: updatedArt,
      }))
    } catch {
      setArtError(t('art.saveError'))
    }
  }

  const handlePickArt = async (
    event: React.MouseEvent,
    app: InstalledApp,
    kind: 'cover' | 'background',
  ) => {
    event.stopPropagation()
    await saveArtForApp(app, kind)
  }

  const clearArtForApp = async (app: InstalledApp) => {
    setArtError(null)

    try {
      const updatedArt = await clearProjectArt(app.owner, app.repo, 'all')
      setProjectArt((current) => ({
        ...current,
        [projectArtKey(app.owner, app.repo)]: updatedArt,
      }))
    } catch {
      setArtError(t('art.clearError'))
    }
  }

  const handleClearArt = async (event: React.MouseEvent, app: InstalledApp) => {
    event.stopPropagation()
    await clearArtForApp(app)
  }

  const handleCardKeyDown = (event: React.KeyboardEvent, key: string) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    setSelectedAppKey(key)
  }

  const selectedApp = apps.find((app) => appKey(app) === selectedAppKey) ?? apps[0]
  const selectedHealth = selectedApp ? healthByApp[appKey(selectedApp)] : undefined
  const selectedNeedsRepair = selectedHealth ? !selectedHealth.ok : false
  const selectedArt = selectedApp ? projectArt[projectArtKey(selectedApp.owner, selectedApp.repo)] : undefined
  const selectedCoverUrl = projectArtCoverUrl(selectedArt)

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
        <StatePanel
          kind="error"
          title={repairTarget ? t('state.repairNeededTitle') : t('state.installedErrorTitle')}
          message={error}
          actionLabel={repairTarget ? t('installed.repair') : t('installed.refresh')}
          onAction={repairTarget ? () => setRepairTarget(repairTarget) : loadApps}
        />
      )}

      {artError && (
        <StatePanel
          kind="error"
          title={t('state.settingsErrorTitle')}
          message={artError}
        />
      )}

      <DownloadProgressPanel downloads={downloads} onCancel={cancel} />

      {selectedApp && !loading && (
        <section className="library-hero installed-hero">
          <div className="library-hero-cover">
            {selectedCoverUrl ? (
              <img src={selectedCoverUrl} alt="" />
            ) : (
              <span>{selectedApp.name.slice(0, 1).toUpperCase()}</span>
            )}
          </div>
          <div className="library-hero-main">
            <div className="repo-status-row">
              <span className={`repo-status ${selectedNeedsRepair ? 'update' : 'installed'}`}>
                {selectedNeedsRepair ? t('installed.healthRepair') : t('installed.healthReady')}
              </span>
            </div>
            <h2 title={selectedApp.name}>{selectedApp.name}</h2>
            <p className="library-hero-repo">{selectedApp.owner}/{selectedApp.repo}</p>
            <div className="library-hero-meta">
              <span>{t('repo.active', { version: selectedApp.activeVersion })}</span>
              <span>{t('installed.versions', { count: selectedApp.versions.length })}</span>
            </div>
            {selectedNeedsRepair && selectedHealth?.message && (
              <p className="library-hero-error">{selectedHealth.message}</p>
            )}
          </div>
          <div className="library-hero-actions">
            {selectedNeedsRepair ? (
              <button type="button" className="hero-primary-btn" onClick={() => setRepairTarget(selectedApp)}>
                {t('installed.repair')}
              </button>
            ) : (
              <button type="button" className="hero-primary-btn" onClick={() => handleLaunch(selectedApp)}>
                {t('installed.launch')}
              </button>
            )}
            <button
              type="button"
              className="secondary-btn"
              onClick={() => openInstalledAppDir(selectedApp.owner, selectedApp.repo).catch((err) =>
                setError(err instanceof Error ? err.message : t('installed.openFolderError')),
              )}
            >
              {t('installed.folder')}
            </button>
            <button
              type="button"
              className="secondary-btn"
              onClick={() => setExpandedApp(expandedApp === appKey(selectedApp) ? null : appKey(selectedApp))}
            >
              {expandedApp === appKey(selectedApp)
                ? t('installed.hide')
                : t('installed.versions', { count: selectedApp.versions.length })}
            </button>
            <div className="hero-art-actions">
              <button type="button" className="secondary-btn" onClick={() => saveArtForApp(selectedApp, 'background')}>
                {t('art.background')}
              </button>
              <button type="button" className="secondary-btn" onClick={() => saveArtForApp(selectedApp, 'cover')}>
                {t('art.cover')}
              </button>
              {(selectedArt?.backgroundPath || selectedArt?.coverPath) && (
                <button type="button" className="secondary-btn" onClick={() => clearArtForApp(selectedApp)}>
                  {t('art.clear')}
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      <div className="apps-list">
        {loading && (
          <StatePanel kind="loading" title={t('installed.loading')} skeletonCount={2} />
        )}

        {!loading && apps.length === 0 && (
          <StatePanel
            kind="empty"
            title={t('installed.emptyTitle')}
            message={t('installed.emptyText')}
          />
        )}

        {apps.map((app) => {
          const key = appKey(app)
          const isExpanded = expandedApp === key
          const health = healthByApp[key]
          const needsRepair = health ? !health.ok : false
          const statusText = needsRepair ? t('installed.healthRepair') : t('installed.healthReady')
          const art = projectArt[projectArtKey(app.owner, app.repo)]
          const coverUrl = projectArtCoverUrl(art)

          return (
            <div
              key={key}
              className={`app-card cinematic-app-card ${needsRepair ? 'app-card--needs-repair' : ''} ${selectedAppKey === key ? 'selected' : ''}`}
              onClick={() => setSelectedAppKey(key)}
              onKeyDown={(event) => handleCardKeyDown(event, key)}
              role="button"
              tabIndex={0}
              aria-label={`${app.name}, ${statusText}`}
            >
              <div className="app-header">
                <div className="app-cover" aria-hidden="true">
                  {coverUrl ? <img src={coverUrl} alt="" /> : <span>{app.name.slice(0, 1).toUpperCase()}</span>}
                </div>
                <div className="app-title-block">
                  <h3 title={app.name}>{app.name}</h3>
                  <p className="app-repo">{app.owner}/{app.repo}</p>
                </div>
                <div className="app-card-badges">
                  {health && (
                    <span className={`health-badge ${needsRepair ? 'repair' : 'ready'}`}>
                      {statusText}
                    </span>
                  )}
                </div>
              </div>

              <div className="app-card-meta">
                <span>{t('repo.active', { version: app.activeVersion })}</span>
                <span>{t('installed.versions', { count: app.versions.length })}</span>
              </div>

              {needsRepair && health?.message && (
                <p className="app-health-message">{health.message}</p>
              )}

              <div className="app-actions">
                {needsRepair && (
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={(event) => {
                      event.stopPropagation()
                      setRepairTarget(app)
                    }}
                  >
                    {t('installed.repair')}
                  </button>
                )}
                <button
                  type="button"
                  className={needsRepair ? 'secondary-btn' : ''}
                  onClick={(event) => {
                    event.stopPropagation()
                    handleLaunch(app)
                  }}
                >
                  {t('installed.launch')}
                </button>
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={(event) => {
                    event.stopPropagation()
                    openInstalledAppDir(app.owner, app.repo).catch((err) =>
                      setError(err instanceof Error ? err.message : t('installed.openFolderError')),
                    )
                  }}
                >
                  {t('installed.folder')}
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    setExpandedApp(isExpanded ? null : key)
                  }}
                  className="secondary-btn"
                >
                  {isExpanded ? t('installed.hide') : t('installed.versions', { count: app.versions.length })}
                </button>
                {selectedAppKey === key && (
                  <>
                    <button
                      type="button"
                      className="secondary-btn art-mini-btn"
                      onClick={(event) => handlePickArt(event, app, 'background')}
                    >
                      {t('art.background')}
                    </button>
                    <button
                      type="button"
                      className="secondary-btn art-mini-btn"
                      onClick={(event) => handlePickArt(event, app, 'cover')}
                    >
                      {t('art.cover')}
                    </button>
                    {(art?.backgroundPath || art?.coverPath) && (
                      <button
                        type="button"
                        className="secondary-btn art-mini-btn"
                        onClick={(event) => handleClearArt(event, app)}
                      >
                        {t('art.clear')}
                      </button>
                    )}
                  </>
                )}
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
                            type="button"
                            className="small-btn"
                            onClick={(event) => {
                              event.stopPropagation()
                              handleSwitch(app.owner, app.repo, version.tag)
                            }}
                          >
                            {t('installed.activate')}
                          </button>
                        )}
                        {version.tag === app.activeVersion && (
                          <span className="active-label">{t('installed.active')}</span>
                        )}
                        <button
                          type="button"
                          className="small-btn danger"
                          onClick={(event) => {
                            event.stopPropagation()
                            handleUninstall(app.owner, app.repo, version.tag)
                          }}
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
          currentVersion={repairTarget.activeVersion}
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
