import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GitHubRelease, GitHubSearchResult, InstalledApp, InstalledAppHealth, VersionInfo } from '../../../types'
import { getReleases } from '../../../services/github'
import {
  launchApp,
  openInstalledAppDir,
  switchVersion,
  uninstallApp,
  uninstallVersion,
  validateInstalledApp,
} from '../../../services/installed'
import { useSettings } from '../../../hooks/useSettings'
import { useI18n, type AppLanguage } from '../../../i18n'
import { useModalFocus } from '../../../hooks/useModalFocus'
import { formatBytes, formatDate } from '../../../utils/format'
import { getLibraryAppStatus } from '../libraryStatus'
import UninstallConfirmModal from './UninstallConfirmModal'
import SwitchVersionConfirmModal from './SwitchVersionConfirmModal'
import './SearchComponents.css'
import '../../../components/Modal/Modal.css'

interface AppDetailsModalProps {
  repo: GitHubSearchResult
  installedApp: InstalledApp
  latestVersion?: string
  onClose: () => void
  onChanged?: () => Promise<void> | void
  onInstallVersion?: () => void
  onUninstalled?: (scope: 'app' | 'version', tag?: string) => void
}

type UninstallTarget = {
  scope: 'app' | 'version'
  tag?: string
}

function appKey(owner: string, repo: string) {
  return `${owner}/${repo}`
}

function stripMarkdown(value: string) {
  return value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/[#>*_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function compareVersionTags(left: string, right: string) {
  const leftParts = left.replace(/^v/i, '').split('.').map((part) => Number.parseInt(part, 10) || 0)
  const rightParts = right.replace(/^v/i, '').split('.').map((part) => Number.parseInt(part, 10) || 0)
  const length = Math.max(leftParts.length, rightParts.length)

  for (let index = 0; index < length; index += 1) {
    const diff = (leftParts[index] ?? 0) - (rightParts[index] ?? 0)
    if (diff !== 0) return diff
  }

  return left.localeCompare(right)
}

function versionDate(version: VersionInfo, language: AppLanguage) {
  return formatDate(version.installedAt, language, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function findRelease(releases: GitHubRelease[], tag: string) {
  return releases.find((release) => release.tag_name === tag) ?? null
}

function AppDetailsModal({
  repo,
  installedApp,
  latestVersion,
  onClose,
  onChanged,
  onInstallVersion,
  onUninstalled,
}: AppDetailsModalProps) {
  const { language, t } = useI18n()
  const { settings } = useSettings()
  const [health, setHealth] = useState<InstalledAppHealth | null>(null)
  const [healthLoading, setHealthLoading] = useState(true)
  const [releases, setReleases] = useState<GitHubRelease[]>([])
  const [releaseError, setReleaseError] = useState<string | null>(null)
  const [busyTag, setBusyTag] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [notesExpanded, setNotesExpanded] = useState(false)
  const [uninstallTarget, setUninstallTarget] = useState<UninstallTarget | null>(null)
  const [uninstallError, setUninstallError] = useState<string | null>(null)
  const [switchTarget, setSwitchTarget] = useState<string | null>(null)
  const [switchError, setSwitchError] = useState<string | null>(null)
  const modalRef = useRef<HTMLDivElement | null>(null)

  const hasUpdate = getLibraryAppStatus(installedApp, latestVersion) === 'update'
  const activeVersion = installedApp.versions.find((version) => version.tag === installedApp.activeVersion)
  const activeRelease = findRelease(releases, installedApp.activeVersion)
  const latestRelease = latestVersion ? findRelease(releases, latestVersion) : null
  const notesRelease = activeRelease ?? latestRelease ?? releases[0] ?? null
  const cleanedReleaseNotes = useMemo(() => {
    if (!notesRelease?.body) return ''
    return stripMarkdown(notesRelease.body)
  }, [notesRelease])
  const releaseNotesLong = cleanedReleaseNotes.length > 420
  const releaseNotes = releaseNotesLong && !notesExpanded
    ? `${cleanedReleaseNotes.slice(0, 420)}...`
    : cleanedReleaseNotes

  const installRoot = settings.installationPath
  const appPath = installRoot
    ? `${installRoot}\\${installedApp.owner}-${installedApp.repo}`
    : ''

  const sortedVersions = useMemo(
    () => [...installedApp.versions].sort((left, right) => compareVersionTags(right.tag, left.tag)),
    [installedApp.versions],
  )
  const newestLocalTag = sortedVersions[0]?.tag
  const missingActiveExecutable = Boolean(health && !health.ok && health.status === 'missingExecutable')

  const refreshHealth = useCallback(async () => {
    setHealthLoading(true)
    try {
      const nextHealth = await validateInstalledApp(installedApp.owner, installedApp.repo)
      setHealth(nextHealth)
    } catch {
      setHealth({
        ok: false,
        status: 'needsRepair',
        executablePath: null,
      })
    } finally {
      setHealthLoading(false)
    }
  }, [installedApp.owner, installedApp.repo, t])

  useEffect(() => {
    refreshHealth()
  }, [refreshHealth])

  useEffect(() => {
    let ignore = false

    getReleases(installedApp.owner, installedApp.repo)
      .then((items) => {
        if (!ignore) {
          setReleases(items.filter((release) => !release.draft).slice(0, 8))
          setReleaseError(null)
        }
      })
      .catch((err) => {
        if (!ignore) {
          setReleaseError(err instanceof Error ? err.message : t('details.releaseNotesError'))
        }
      })

    return () => {
      ignore = true
    }
  }, [installedApp.owner, installedApp.repo, t])

  useModalFocus(modalRef, { active: !uninstallTarget && !switchTarget, onEscape: onClose })

  useEffect(() => {
    setNotesExpanded(false)
  }, [notesRelease?.tag_name])

  const runAndRefresh = async (operation: () => Promise<void>, tag?: string) => {
    setActionError(null)
    setBusyTag(tag ?? 'app')
    try {
      await operation()
      await onChanged?.()
      await refreshHealth()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('details.actionError'))
    } finally {
      setBusyTag(null)
    }
  }

  const handleLaunch = () => runAndRefresh(
    () => launchApp(installedApp.owner, installedApp.repo),
    'launch',
  )

  const handleOpenFolder = () => runAndRefresh(
    () => openInstalledAppDir(installedApp.owner, installedApp.repo),
    'folder',
  )

  const handleCopy = async (key: string, value: string) => {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopiedKey(key)
      window.setTimeout(() => setCopiedKey(null), 1400)
    } catch {
      setActionError(t('details.copyError'))
    }
  }

  const handleSwitch = (tag: string) => {
    setSwitchError(null)
    setSwitchTarget(tag)
  }

  const handleConfirmSwitch = async () => {
    if (!switchTarget) return
    const tag = switchTarget

    setSwitchError(null)
    setBusyTag(tag)
    try {
      await switchVersion(installedApp.owner, installedApp.repo, tag)
      setSwitchTarget(null)
      await onChanged?.()
      await refreshHealth()
    } catch (err) {
      setSwitchError(err instanceof Error ? err.message : t('details.actionError'))
    } finally {
      setBusyTag(null)
    }
  }

  const handleDelete = (tag: string) => {
    setUninstallError(null)
    setUninstallTarget({ scope: 'version', tag })
  }

  const handleConfirmUninstall = async () => {
    if (!uninstallTarget) return

    const target = uninstallTarget
    const tag = target.tag
    setUninstallError(null)
    setBusyTag(target.scope === 'app' ? 'uninstall-app' : tag ?? 'uninstall-version')

    try {
      if (target.scope === 'app') {
        await uninstallApp(installedApp.owner, installedApp.repo)
      } else if (tag) {
        await uninstallVersion(installedApp.owner, installedApp.repo, tag)
      }

      setUninstallTarget(null)
      onUninstalled?.(target.scope, tag)
      await onChanged?.()
      if (target.scope === 'version' && installedApp.versions.length > 1) {
        await refreshHealth()
      }
    } catch (err) {
      setUninstallError(err instanceof Error ? err.message : t('installed.uninstallError'))
    } finally {
      setBusyTag(null)
    }
  }

  const statusLabel = healthLoading
    ? t('installed.checkingHealth')
    : health?.ok
      ? t('installed.healthReady')
      : t('installed.healthRepair')

  return (
    <>
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={modalRef}
        className="modal-content app-details-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-details-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header app-details-header">
          <div>
            <span className="app-details-kicker">{t('details.kicker')}</span>
            <h2 id="app-details-title">{installedApp.name}</h2>
            <p className="modal-subtitle">{appKey(repo.owner.login, repo.name)}</p>
          </div>
          <button
            type="button"
            className="close-btn"
            onClick={onClose}
            aria-label={t('release.close')}
          >
            {'\u00d7'}
          </button>
        </div>

        <div className="app-details-body">
          <div className="visually-hidden" aria-live="polite" aria-atomic="true">
            {copiedKey ? t('details.copied') : ''}
          </div>
          <section className="app-details-summary" aria-label={t('details.summary')}>
            <div className="app-details-status-row">
              <span className={`health-badge ${health?.ok ? 'ready' : 'repair'}`}>
                {statusLabel}
              </span>
              {hasUpdate && latestVersion && (
                <span className="repo-status update">{t('repo.new', { version: latestVersion })}</span>
              )}
            </div>
            <div className="app-details-facts">
              <div>
                <span>{t('details.activeVersion')}</span>
                <strong>{installedApp.activeVersion}</strong>
              </div>
              <div>
                <span>{t('details.latestVersion')}</span>
                <strong>{latestVersion ?? t('details.unknown')}</strong>
              </div>
              <div>
                <span>{t('details.localVersions')}</span>
                <strong>{installedApp.versions.length}</strong>
              </div>
              <div>
                <span>{t('details.activeFile')}</span>
                <strong>{activeVersion?.executable ?? t('details.unknown')}</strong>
              </div>
            </div>
            {health && !health.ok && (
              <p className="app-details-health-message">
                {health.status === 'missingExecutable'
                  ? t('installed.healthMissingExe')
                  : t('installed.healthRepair')}
              </p>
            )}
            <div className="app-details-actions">
              <button type="button" className="hero-primary-btn" onClick={handleLaunch} disabled={busyTag !== null} data-autofocus="true">
                {t('installed.launch')}
              </button>
              <button type="button" className="secondary-btn" onClick={handleOpenFolder} disabled={busyTag !== null}>
                {t('installed.folder')}
              </button>
              <button type="button" className="secondary-btn" onClick={onInstallVersion} disabled={busyTag !== null}>
                {hasUpdate ? t('repo.updateAction') : t('repo.versions')}
              </button>
              {!healthLoading && health && !health.ok && (
                <button type="button" className="secondary-btn" onClick={onInstallVersion} disabled={busyTag !== null}>
                  {t('installed.repair')}
                </button>
              )}
            </div>
            {actionError && <div className="error-message">{actionError}</div>}
          </section>

          <section className="app-details-panel">
            <div className="app-details-panel-title">
              <span>{t('details.paths')}</span>
            </div>
            <div className="app-details-paths">
              <div className="app-details-copy-row">
                <span>{t('release.installPath')}</span>
                <strong>{appPath || t('details.unknown')}</strong>
                {appPath && (
                  <button
                    type="button"
                    className="small-btn app-details-copy-btn"
                    aria-label={t('details.copyInstallPath')}
                    onClick={() => handleCopy('installPath', appPath)}
                  >
                    {copiedKey === 'installPath' ? t('details.copied') : t('details.copy')}
                  </button>
                )}
              </div>
              <div className="app-details-copy-row">
                <span>{t('details.executablePath')}</span>
                <strong>{health?.executablePath ?? t('details.unknown')}</strong>
                {health?.executablePath && (
                  <button
                    type="button"
                    className="small-btn app-details-copy-btn"
                    aria-label={t('details.copyExecutablePath')}
                    onClick={() => handleCopy('executablePath', health.executablePath ?? '')}
                  >
                    {copiedKey === 'executablePath' ? t('details.copied') : t('details.copy')}
                  </button>
                )}
              </div>
            </div>
          </section>

          <section className="app-details-panel">
            <div className="app-details-panel-title">
              <span>{t('details.releaseNotes')}</span>
              {notesRelease && <strong>{notesRelease.tag_name}</strong>}
            </div>
            {releaseError ? (
              <p className="app-details-muted">{releaseError}</p>
            ) : releaseNotes ? (
              <>
                <p className="app-details-notes">{releaseNotes}</p>
                {releaseNotesLong && (
                  <button
                    type="button"
                    className="app-details-text-btn"
                    onClick={() => setNotesExpanded((value) => !value)}
                  >
                    {notesExpanded ? t('details.showLess') : t('details.showMore')}
                  </button>
                )}
              </>
            ) : (
              <p className="app-details-muted">{t('details.noReleaseNotes')}</p>
            )}
          </section>

          <section className="app-details-panel app-details-versions">
            <div className="app-details-panel-title">
              <div className="app-details-version-title">
                <span>{t('details.localVersions')}</span>
                <strong>{installedApp.versions.length}</strong>
              </div>
              <div className="app-details-version-tools">
                <button
                  type="button"
                  className="small-btn danger"
                  onClick={() => handleDelete(installedApp.activeVersion)}
                  disabled={busyTag !== null}
                >
                  {t('installed.uninstallCurrent')}
                </button>
                {installedApp.versions.length > 1 && (
                  <button
                    type="button"
                    className="small-btn danger"
                    onClick={() => {
                      setUninstallError(null)
                      setUninstallTarget({ scope: 'app' })
                    }}
                    disabled={busyTag !== null}
                  >
                    {t('installed.uninstallAllVersions')}
                  </button>
                )}
              </div>
            </div>
            <div className="app-details-version-summary">
              <div>
                <span>{t('details.versionStateActive')}</span>
                <strong>{installedApp.activeVersion}</strong>
              </div>
              <div>
                <span>{t('details.versionStateNewest')}</span>
                <strong>{newestLocalTag ?? t('details.unknown')}</strong>
              </div>
              <div>
                <span>{t('details.versionHistory')}</span>
                <strong>{t('details.versionHistoryCount', { count: sortedVersions.length })}</strong>
              </div>
            </div>
            <div className="app-details-version-list">
              {sortedVersions.map((version) => {
                const isActive = version.tag === installedApp.activeVersion
                const isBusy = busyTag === version.tag
                const isNewest = version.tag === newestLocalTag
                const isMissing = isActive && missingActiveExecutable
                const stateLabel = isMissing
                  ? t('details.versionStateMissing')
                  : isActive
                    ? t('details.versionStateActive')
                    : isNewest
                      ? t('details.versionStateNewest')
                      : t('details.versionStateOlder')
                const kindLabel = version.installKind
                  ? t('details.installKindValue', { kind: version.installKind })
                  : t('details.installKindUnknown')
                return (
                  <div key={version.tag} className={`app-details-version-row ${isActive ? 'active' : ''} ${isMissing ? 'missing' : ''}`}>
                    <div className="app-details-version-main">
                      <div className="app-details-version-heading">
                        <strong>{version.tag}</strong>
                        <em>{stateLabel}</em>
                      </div>
                      <span>{versionDate(version, language)} · {formatBytes(version.sizeBytes, language)} · {kindLabel}</span>
                      <span>{version.assetName || t('details.assetNameUnknown')}</span>
                      {isMissing && <span className="app-details-version-warning">{t('installed.healthMissingExe')}</span>}
                    </div>
                    <div className="app-details-version-actions">
                      {isActive ? (
                        <span className="active-label">{t('installed.active')}</span>
                      ) : (
                        <button
                          type="button"
                          className="small-btn"
                          onClick={() => handleSwitch(version.tag)}
                          disabled={busyTag !== null}
                        >
                          {isBusy ? t('details.working') : t('installed.activate')}
                        </button>
                      )}
                      {!isActive && (
                        <button
                          type="button"
                          className="small-btn danger"
                          onClick={() => handleDelete(version.tag)}
                          disabled={busyTag !== null}
                        >
                          {t('installed.uninstallVersion')}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
    {uninstallTarget && (
      <UninstallConfirmModal
        installedApp={installedApp}
        appPath={appPath}
        scope={uninstallTarget.scope}
        tag={uninstallTarget.tag}
        busy={busyTag !== null}
        error={uninstallError}
        onCancel={() => {
          if (!busyTag) {
            setUninstallTarget(null)
            setUninstallError(null)
          }
        }}
        onConfirm={handleConfirmUninstall}
      />
    )}
    {switchTarget && (
      <SwitchVersionConfirmModal
        appName={installedApp.name}
        currentVersion={installedApp.activeVersion}
        targetVersion={switchTarget}
        busy={busyTag !== null}
        error={switchError}
        onCancel={() => {
          if (!busyTag) {
            setSwitchTarget(null)
            setSwitchError(null)
          }
        }}
        onConfirm={handleConfirmSwitch}
      />
    )}
    </>
  )
}

export default AppDetailsModal
