import { useEffect, useMemo, useRef, useState } from 'react'
import appIcon from '../../src-tauri/icons/128x128.png'
import { getReleases } from '../services/github'
import {
  cleanupLauncherUpdateFiles,
  getLauncherStorageInfo,
  getLauncherVersion,
  installLauncherRelease,
  openDir,
  openExternalUrl,
} from '../services/updates'
import StatePanel from '../components/State/StatePanel'
import type { GitHubAsset, GitHubRelease, LauncherStorageInfo } from '../types'
import { useI18n } from '../i18n'
import { useModalFocus } from '../hooks/useModalFocus'
import '../components/Modal/Modal.css'
import './PageStyles.css'

const LAUNCHER_OWNER = 'CpPrice11'
const LAUNCHER_REPO = 'pullora'
const FALLBACK_CURRENT_VERSION = 'v5.2.34'

type PendingLauncherAction = {
  release: GitHubRelease
  asset: GitHubAsset
  action: 'update' | 'rollback'
}

type AboutReleaseFilter = 'all' | 'rollback' | 'current'

const releaseFilters: AboutReleaseFilter[] = ['all', 'rollback', 'current']

function compareVersionTags(left: string, right: string) {
  const leftParts = left.replace(/^v/i, '').split('.').map((part) => Number.parseInt(part, 10) || 0)
  const rightParts = right.replace(/^v/i, '').split('.').map((part) => Number.parseInt(part, 10) || 0)
  const length = Math.max(leftParts.length, rightParts.length)

  for (let index = 0; index < length; index += 1) {
    const diff = (leftParts[index] ?? 0) - (rightParts[index] ?? 0)
    if (diff !== 0) return diff
  }

  return 0
}

function pickPortableLauncherAsset(assets: GitHubAsset[]) {
  const candidates = assets.filter((asset) => {
    const name = asset.name.toLowerCase()
    const isWindowsBinary = name.endsWith('.exe') || name.endsWith('.zip')
    const isInstaller = name.includes('setup') ||
      name.includes('installer') ||
      name.endsWith('.msi')

    return isWindowsBinary && !isInstaller
  })

  const portable = candidates.find((asset) => asset.name.toLowerCase().includes('portable'))
  if (portable) return portable

  const pulloraExe = candidates.find((asset) => {
    const name = asset.name.toLowerCase()
    return name.endsWith('.exe') && (name.includes('pullora') || name.includes('air.launcher'))
  })
  if (pulloraExe) return pulloraExe

  return candidates.find((asset) => asset.name.toLowerCase().endsWith('.zip')) ??
    candidates.find((asset) => asset.name.toLowerCase().endsWith('.exe')) ??
    null
}

function releaseFilterLabelKey(filter: AboutReleaseFilter) {
  return `about.filter.${filter}`
}

function releaseUrl(release: GitHubRelease) {
  return release.html_url ?? `https://github.com/${LAUNCHER_OWNER}/${LAUNCHER_REPO}/releases/tag/${release.tag_name}`
}

function compactReleaseNotes(body: string | null | undefined) {
  if (!body?.trim()) return ''
  return body
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[\s>*-]+/gm, '')
    .trim()
}

function formatBytes(bytes: number, language: string) {
  if (!bytes) return language === 'en' ? '0 MB' : '0 МБ'
  const units = language === 'en'
    ? ['B', 'KB', 'MB', 'GB']
    : ['Б', 'КБ', 'МБ', 'ГБ']
  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

function AboutPage() {
  const { language, t } = useI18n()
  const [currentVersion, setCurrentVersion] = useState(FALLBACK_CURRENT_VERSION)
  const [releases, setReleases] = useState<GitHubRelease[]>([])
  const [releaseFilter, setReleaseFilter] = useState<AboutReleaseFilter>('all')
  const [notesRelease, setNotesRelease] = useState<GitHubRelease | null>(null)
  const [menuReleaseId, setMenuReleaseId] = useState<number | null>(null)
  const [storageInfo, setStorageInfo] = useState<LauncherStorageInfo | null>(null)
  const [loadingReleases, setLoadingReleases] = useState(true)
  const [releaseLoadError, setReleaseLoadError] = useState<string | null>(null)
  const [installingVersion, setInstallingVersion] = useState<string | null>(null)
  const [installError, setInstallError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [refreshState, setRefreshState] = useState<'idle' | 'success' | 'error'>('idle')
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null)
  const [pendingAction, setPendingAction] = useState<PendingLauncherAction | null>(null)
  const confirmModalRef = useRef<HTMLDivElement | null>(null)
  const notesModalRef = useRef<HTMLDivElement | null>(null)

  const loadLauncherStorageInfo = async () => {
    try {
      setStorageInfo(await getLauncherStorageInfo())
    } catch {
      setStorageInfo(null)
    }
  }

  const loadLauncherReleases = async (forceRefresh = false) => {
    setRefreshState('idle')
    setLoadingReleases(true)
    setReleaseLoadError(null)
    try {
      const items = await getReleases(LAUNCHER_OWNER, LAUNCHER_REPO, forceRefresh)
      setReleases(items)
      setInstallError(null)
      setLastRefreshedAt(new Date())
      setRefreshState('success')
      await loadLauncherStorageInfo()
    } catch (err) {
      setReleases([])
      setReleaseLoadError(err instanceof Error ? err.message : t('about.noReleases'))
      setRefreshState('error')
    } finally {
      setLoadingReleases(false)
    }
  }

  useEffect(() => {
    getLauncherVersion()
      .then(setCurrentVersion)
      .catch(() => setCurrentVersion(FALLBACK_CURRENT_VERSION))
    loadLauncherStorageInfo()
  }, [])

  useEffect(() => {
    loadLauncherReleases()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!actionMessage && !actionError) return undefined

    const timer = window.setTimeout(() => {
      setActionMessage(null)
      setActionError(null)
    }, actionError ? 6000 : 3800)

    return () => window.clearTimeout(timer)
  }, [actionError, actionMessage])

  useEffect(() => {
    if (menuReleaseId === null) return undefined

    const closeMenu = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest('.about-release-menu')) setMenuReleaseId(null)
    }

    document.addEventListener('click', closeMenu)
    return () => document.removeEventListener('click', closeMenu)
  }, [menuReleaseId])

  useModalFocus(confirmModalRef, {
    active: Boolean(pendingAction),
    onEscape: pendingAction && !installingVersion ? () => setPendingAction(null) : undefined,
  })
  useModalFocus(notesModalRef, {
    active: Boolean(notesRelease),
    onEscape: notesRelease ? () => setNotesRelease(null) : undefined,
  })

  const latestRelease = releases.find((release) => !release.draft && !release.prerelease) ?? releases[0]
  const rollbackCount = releases.filter((release) =>
    pickPortableLauncherAsset(release.assets) &&
    release.tag_name !== currentVersion &&
    compareVersionTags(release.tag_name, currentVersion) < 0
  ).length
  const filteredReleases = useMemo(() => {
    return releases.filter((release) => {
      const hasPortable = Boolean(pickPortableLauncherAsset(release.assets))
      const isCurrent = release.tag_name === currentVersion
      const comparison = compareVersionTags(release.tag_name, currentVersion)

      if (releaseFilter === 'rollback') return hasPortable && !isCurrent && comparison < 0
      if (releaseFilter === 'current') return isCurrent
      return true
    })
  }, [currentVersion, releaseFilter, releases])

  const formattedRefreshTime = lastRefreshedAt
    ? lastRefreshedAt.toLocaleTimeString(language === 'en' ? 'en-US' : 'uk-UA', {
      hour: '2-digit',
      minute: '2-digit',
    })
    : null

  const getReleaseStatus = (tagName: string, hasPortableAsset: boolean) => {
    if (!hasPortableAsset) return t('about.portableUnavailableStatus')
    if (tagName === currentVersion) return t('about.currentStatus')
    return compareVersionTags(tagName, currentVersion) > 0
      ? t('about.newerStatus')
      : t('about.olderStatus')
  }

  const requestActivateRelease = (release: GitHubRelease) => {
    const asset = pickPortableLauncherAsset(release.assets)

    if (!asset) {
      setInstallError(t('about.noPortableAsset'))
      return
    }

    setInstallError(null)
    setPendingAction({
      release,
      asset,
      action: compareVersionTags(release.tag_name, currentVersion) > 0 ? 'update' : 'rollback',
    })
  }

  const confirmActivateRelease = async () => {
    if (!pendingAction) return

    setInstallError(null)
    setInstallingVersion(pendingAction.release.tag_name)
    try {
      await installLauncherRelease(
        pendingAction.release.tag_name,
        pendingAction.asset.browser_download_url,
        pendingAction.asset.name,
      )
    } catch (err) {
      setInstallError(
        err instanceof Error ? err.message : t('about.activateError'),
      )
      setInstallingVersion(null)
      setPendingAction(null)
    }
  }

  const openLauncherFolder = async () => {
    try {
      const info = storageInfo ?? await getLauncherStorageInfo()
      setStorageInfo(info)
      await openDir(info.launcherDir)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('installed.openFolderError'))
    }
  }

  const openReleaseInBrowser = async (release: GitHubRelease) => {
    try {
      await openExternalUrl(releaseUrl(release))
      setActionError(null)
    } catch (err) {
      setActionMessage(null)
      setActionError(err instanceof Error ? err.message : t('about.openGitHubError'))
    }
  }

  const openLatestRelease = () => {
    if (!latestRelease) return
    void openReleaseInBrowser(latestRelease)
  }

  const cleanupOldLauncherFiles = async () => {
    if (!window.confirm(t('about.cleanupConfirm'))) return

    try {
      const info = await cleanupLauncherUpdateFiles()
      setStorageInfo(info)
      setActionError(null)
      setActionMessage(t('about.cleanupDone'))
    } catch (err) {
      setActionMessage(null)
      setActionError(err instanceof Error ? err.message : t('about.cleanupError'))
    }
  }

  return (
    <div className="page about-page">
      <div className="page-header">
        <h2>{t('about.title')}</h2>
      </div>

      <section className="about-hero">
        <div className="about-hero-mark" aria-hidden="true">
          <img src={appIcon} alt="" />
        </div>
        <div className="about-hero-main">
          <h3>Pullora</h3>
          <p>{t('about.updateCenter')}</p>
          <div className="about-hero-meta">
            <span className="about-current-version-chip">{t('about.currentVersion')}: {currentVersion.replace(/^v/, '')}</span>
            {latestRelease && (
              <span>
                {t('about.latestVersion')}: {latestRelease.tag_name.replace(/^v/, '')}
              </span>
            )}
          </div>
        </div>
        <div className="about-hero-actions" aria-label={t('about.launcherActions')}>
          <button type="button" className="secondary-btn" onClick={openLauncherFolder}>
            {t('about.openLauncherFolder')}
          </button>
          <button type="button" className="secondary-btn" onClick={openLatestRelease} disabled={!latestRelease}>
            {t('about.openGitHubRelease')}
          </button>
        </div>
      </section>

      {(actionMessage || actionError) && (
        <div className={actionError ? 'about-toast about-toast--error' : 'about-toast about-toast--success'} role="status">
          {actionError ?? actionMessage}
        </div>
      )}

      <div className="about-grid">
        <section className="about-panel about-panel-wide">
          <div className="section-heading-row about-version-heading">
            <div className="about-version-title">
              <h3>{t('about.launcherVersions')}</h3>
              <span className="about-panel-meta">
                {t('about.rollbackReady')}: {rollbackCount}
                {storageInfo ? ` · ${t('about.cleanupEstimate')}: ${formatBytes(storageInfo.cleanupBytes, language)}` : ''}
                {refreshState === 'success' && formattedRefreshTime ? ` · ${t('refresh.updatedAt', { time: formattedRefreshTime })}` : ''}
              </span>
            </div>
            <div className="segmented-control about-version-filters" aria-label={t('about.filterLabel')}>
              {releaseFilters.map((filter) => (
                <button
                  key={filter}
                  type="button"
                  className={releaseFilter === filter ? 'active' : ''}
                  aria-pressed={releaseFilter === filter}
                  onClick={() => setReleaseFilter(filter)}
                >
                  {t(releaseFilterLabelKey(filter))}
                </button>
              ))}
            </div>
          </div>
          <div className="about-panel-toolbar" aria-label={t('about.launcherActions')}>
            <button type="button" className="secondary-btn" onClick={() => void loadLauncherReleases(true)} disabled={loadingReleases || installingVersion !== null}>
              {loadingReleases ? t('library.refreshing') : t('library.refresh')}
            </button>
            <button
              type="button"
              className="secondary-btn"
              onClick={cleanupOldLauncherFiles}
              disabled={!storageInfo || storageInfo.cleanupBytes === 0}
            >
              {t('about.cleanupOldVersionsShort')}
            </button>
          </div>
          {installError && (
            <div className="error-banner about-recovery-banner">
              <div>
                <strong>{installError}</strong>
                <span>{t('about.recoveryHint')}</span>
              </div>
              <button type="button" onClick={() => void loadLauncherReleases(true)}>
                {t('about.retryRefresh')}
              </button>
            </div>
          )}
          {releaseLoadError && (
            <StatePanel
              kind="error"
              title={t('state.launcherVersionsErrorTitle')}
              message={t('state.launcherVersionsErrorText')}
              details={releaseLoadError}
              detailsLabel={t('state.details')}
              actionLabel={t('about.retry')}
              onAction={() => void loadLauncherReleases(true)}
            />
          )}
          {loadingReleases && (
            <StatePanel kind="loading" title={t('about.loadingReleases')} skeletonCount={3} />
          )}
          {!loadingReleases && releases.length === 0 && !releaseLoadError && (
            <StatePanel
              kind="empty"
              title={t('about.noReleases')}
              message={t('state.launcherVersionsEmptyText')}
              actionLabel={t('about.retry')}
              onAction={() => void loadLauncherReleases(true)}
            />
          )}
          {!loadingReleases && releases.length > 0 && filteredReleases.length === 0 && (
            <StatePanel
              kind="empty"
              title={t('about.noFilteredReleases')}
              message={t('about.noFilteredReleasesText')}
            />
          )}
          {!loadingReleases && filteredReleases.length > 0 && (
            <div className="about-release-list">
              {filteredReleases.map((release) => {
                const portableAsset = pickPortableLauncherAsset(release.assets)
                const isCurrent = release.tag_name === currentVersion
                const canActivate = Boolean(portableAsset) && !isCurrent
                const statusClass = !portableAsset
                  ? 'missing'
                  : isCurrent
                    ? 'current'
                    : compareVersionTags(release.tag_name, currentVersion) > 0
                      ? 'newer'
                      : 'older'
                const menuOpen = menuReleaseId === release.id

                return (
                  <div
                    key={release.id}
                    className={`about-release-link about-release-link--${statusClass} ${
                      isCurrent ? 'active' : ''
                    }`}
                    aria-label={`${release.tag_name}, ${getReleaseStatus(release.tag_name, Boolean(portableAsset))}`}
                  >
                    <div className="about-release-orb" aria-hidden="true">
                      <span>{release.tag_name.replace(/^v/i, '').split('.')[0] ?? 'v'}</span>
                    </div>
                    <div className="about-release-main">
                      <div className="about-release-title">
                        <span>{release.tag_name}</span>
                        {portableAsset && (
                          <span className="about-release-portable-badge">
                            {t('about.portableShort')}
                          </span>
                        )}
                        <span className={`about-release-status ${statusClass}`}>
                          {getReleaseStatus(release.tag_name, Boolean(portableAsset))}
                        </span>
                      </div>
                      <span className="about-release-date">
                        {release.published_at
                          ? new Date(release.published_at).toLocaleDateString(language === 'en' ? 'en-US' : 'uk-UA')
                          : t('about.noDate')}
                        {portableAsset ? ` · ${portableAsset.name}` : ''}
                      </span>
                      {!portableAsset && (
                        <span className="about-release-warning">
                          {t('about.portableMissing')}
                        </span>
                      )}
                    </div>
                    <div className="about-release-actions">
                      {isCurrent ? (
                        <span className="about-release-active-badge">{t('about.active')}</span>
                      ) : (
                        <button
                          type="button"
                          className="secondary-btn"
                          disabled={!canActivate || installingVersion !== null}
                          onClick={() => requestActivateRelease(release)}
                        >
                          {installingVersion === release.tag_name
                            ? t('about.activating')
                            : compareVersionTags(release.tag_name, currentVersion) > 0
                              ? t('about.update')
                              : t('about.rollback')}
                        </button>
                      )}
                      <div className={`project-actions-menu about-release-menu ${menuOpen ? 'open' : ''}`}>
                        <button
                          type="button"
                          className="project-actions-trigger"
                          aria-haspopup="menu"
                          aria-expanded={menuOpen}
                          aria-label={t('about.moreActions')}
                          onClick={() => setMenuReleaseId(menuOpen ? null : release.id)}
                        >
                          ...
                        </button>
                        {menuOpen && (
                          <div className="project-actions-popover" role="menu" aria-label={t('about.moreActions')}>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setMenuReleaseId(null)
                                setNotesRelease(release)
                              }}
                            >
                              {t('about.showNotes')}
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setMenuReleaseId(null)
                                void openReleaseInBrowser(release)
                              }}
                            >
                              {t('about.openGitHubReleaseShort')}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>

      {notesRelease && (
        <div className="modal-overlay" role="presentation" onClick={() => setNotesRelease(null)}>
          <div
            ref={notesModalRef}
            className="modal-content about-notes-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="about-notes-title"
            tabIndex={-1}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="about-notes-header">
              <div>
                <span className="about-notes-kicker">{t('about.releaseNotesPreview')}</span>
                <h3 id="about-notes-title">{notesRelease.tag_name}</h3>
              </div>
              <button
                type="button"
                className="close-btn"
                onClick={() => setNotesRelease(null)}
                aria-label={t('settings.close')}
              >
                {'\u00d7'}
              </button>
            </div>
            <div className="about-notes-body">
              <p>{compactReleaseNotes(notesRelease.body) || t('details.noReleaseNotes')}</p>
            </div>
            <div className="about-notes-actions">
              <button type="button" className="secondary-btn" onClick={() => void openReleaseInBrowser(notesRelease)}>
                {t('about.openGitHubRelease')}
              </button>
              <button type="button" className="secondary-btn" onClick={() => setNotesRelease(null)}>
                {t('settings.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingAction && (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={() => {
            if (!installingVersion) setPendingAction(null)
          }}
        >
          <div
            ref={confirmModalRef}
            className="modal-content confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="launcher-confirm-title"
            tabIndex={-1}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="confirm-modal-header">
              <div>
                <span className="confirm-modal-kicker">
                  {pendingAction.action === 'update' ? t('about.update') : t('about.rollback')}
                </span>
                <h3 id="launcher-confirm-title">
                  {pendingAction.action === 'update'
                    ? t('about.updateConfirmTitle', { version: pendingAction.release.tag_name })
                    : t('about.rollbackConfirmTitle', { version: pendingAction.release.tag_name })}
                </h3>
              </div>
              <button
                type="button"
                className="close-btn confirm-close-btn"
                disabled={installingVersion !== null}
                onClick={() => setPendingAction(null)}
                aria-label={t('about.cancel')}
              >
                {'\u00d7'}
              </button>
            </div>
            <p className="confirm-copy">
              {t(pendingAction.action === 'update' ? 'about.updateConfirmDetail' : 'about.rollbackConfirmDetail')}
            </p>
            <div className="confirm-facts">
              <div>
                <span>{t('about.confirmCurrent')}</span>
                <strong>{currentVersion}</strong>
              </div>
              <div>
                <span>{t('about.confirmTarget')}</span>
                <strong>{pendingAction.release.tag_name}</strong>
              </div>
              <div>
                <span>{t('about.confirmAsset')}</span>
                <strong>{pendingAction.asset.name}</strong>
              </div>
              <div>
                <span>{t('about.confirmLauncherDir')}</span>
                <strong>{storageInfo?.launcherDir ?? t('details.unknown')}</strong>
              </div>
            </div>
            <ul className="confirm-list">
              <li>{t('about.confirmReplace')}</li>
              <li>{t('about.confirmClose')}</li>
              <li>{t('about.confirmBackup')}</li>
            </ul>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-btn"
                disabled={installingVersion !== null}
                onClick={() => setPendingAction(null)}
                data-autofocus="true"
              >
                {t('about.cancel')}
              </button>
              <button
                type="button"
                className="primary-btn confirm-primary-btn"
                disabled={installingVersion !== null}
                onClick={confirmActivateRelease}
              >
                {installingVersion
                  ? t('about.activating')
                  : pendingAction.action === 'update'
                    ? t('about.confirmUpdate')
                    : t('about.confirmRollback')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AboutPage
