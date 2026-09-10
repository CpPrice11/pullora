import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import appIcon from '../../src-tauri/icons/128x128.png'
import { getReleases } from '../services/github'
import {
  cleanupLauncherUpdateFiles,
  getLauncherInstallationMode,
  getLauncherStorageInfo,
  getLauncherVersion,
  installLauncherUpdate,
  openDir,
  openExternalUrl,
} from '../services/updates'
import StatePanel from '../components/State/StatePanel'
import { CloseIcon, MoreHorizontalIcon, StatusIcon } from '../components/ui/Icons'
import type { GitHubRelease, LauncherInstallationMode, LauncherStorageInfo } from '../types'
import { useI18n } from '../i18n'
import { useModalFocus } from '../hooks/useModalFocus'
import { compareVersionTags, formatBytes, formatDate } from '../utils/format'
import { focusFirstMenuItem, handleMenuKeyboard } from '../utils/menuKeyboard'
import '../components/Modal/Modal.css'
import './PageStyles.css'

const LAUNCHER_OWNER = 'CpPrice11'
const LAUNCHER_REPO = 'pullora'
const FALLBACK_CURRENT_VERSION = 'v5.20.0'
type AboutReleaseFilter = 'all' | 'rollback' | 'current'
type LauncherStatus = 'checking' | 'current' | 'update' | 'localNewer' | 'unknown'

const releaseFilters: AboutReleaseFilter[] = ['all', 'rollback', 'current']

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

function AboutPage() {
  const { language, t } = useI18n()
  const [currentVersion, setCurrentVersion] = useState(FALLBACK_CURRENT_VERSION)
  const [installationMode, setInstallationMode] = useState<LauncherInstallationMode | null>(null)
  const [releases, setReleases] = useState<GitHubRelease[]>([])
  const [releaseFilter, setReleaseFilter] = useState<AboutReleaseFilter>('all')
  const [notesRelease, setNotesRelease] = useState<GitHubRelease | null>(null)
  const [menuReleaseId, setMenuReleaseId] = useState<number | null>(null)
  const [releaseMenuPosition, setReleaseMenuPosition] = useState<{ x: number; y: number; openUp: boolean } | null>(null)
  const [storageInfo, setStorageInfo] = useState<LauncherStorageInfo | null>(null)
  const [loadingReleases, setLoadingReleases] = useState(true)
  const [releaseLoadError, setReleaseLoadError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [refreshState, setRefreshState] = useState<'idle' | 'success' | 'error'>('idle')
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null)
  const [pendingUpdate, setPendingUpdate] = useState<GitHubRelease | null>(null)
  const [updating, setUpdating] = useState(false)
  const [cleanupConfirmOpen, setCleanupConfirmOpen] = useState(false)
  const [cleanupBusy, setCleanupBusy] = useState(false)
  const [cleanupError, setCleanupError] = useState<string | null>(null)
  const updateModalRef = useRef<HTMLDivElement | null>(null)
  const updateButtonRef = useRef<HTMLButtonElement | null>(null)
  const cleanupModalRef = useRef<HTMLDivElement | null>(null)
  const cleanupButtonRef = useRef<HTMLButtonElement | null>(null)
  const notesModalRef = useRef<HTMLDivElement | null>(null)
  const notesReturnFocusRef = useRef<HTMLButtonElement | null>(null)
  const releaseMenuRef = useRef<HTMLDivElement | null>(null)
  const releaseMenuTriggerRef = useRef<HTMLButtonElement | null>(null)

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
    getLauncherInstallationMode()
      .then(setInstallationMode)
      .catch(() => setInstallationMode(null))
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

    const closeMenu = (event: PointerEvent) => {
      const target = event.target as Node
      if (!releaseMenuRef.current?.contains(target) && !releaseMenuTriggerRef.current?.contains(target)) {
        setMenuReleaseId(null)
      }
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuReleaseId(null)
        releaseMenuTriggerRef.current?.focus()
      }
    }

    document.addEventListener('pointerdown', closeMenu)
    document.addEventListener('keydown', closeOnEscape)
    focusFirstMenuItem(releaseMenuRef.current?.querySelector<HTMLElement>('[role="menu"]') ?? null)
    return () => {
      document.removeEventListener('pointerdown', closeMenu)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [menuReleaseId])

  useModalFocus(notesModalRef, {
    active: Boolean(notesRelease),
    onEscape: notesRelease ? () => setNotesRelease(null) : undefined,
    returnFocusRef: notesReturnFocusRef,
  })
  useModalFocus(updateModalRef, {
    active: Boolean(pendingUpdate),
    onEscape: pendingUpdate && !updating ? () => setPendingUpdate(null) : undefined,
    returnFocusRef: updateButtonRef,
  })
  useModalFocus(cleanupModalRef, {
    active: cleanupConfirmOpen,
    onEscape: cleanupConfirmOpen && !cleanupBusy ? () => setCleanupConfirmOpen(false) : undefined,
    returnFocusRef: cleanupButtonRef,
  })

  const latestRelease = releases.find((release) => !release.draft && !release.prerelease) ?? releases[0]
  const latestVersionComparison = latestRelease
    ? compareVersionTags(latestRelease.tag_name, currentVersion)
    : null
  const hasNewerRelease = latestVersionComparison !== null && latestVersionComparison > 0
  const launcherStatus: LauncherStatus = loadingReleases
    ? 'checking'
    : releaseLoadError || latestVersionComparison === null
      ? 'unknown'
      : latestVersionComparison > 0
        ? 'update'
        : latestVersionComparison < 0
          ? 'localNewer'
          : 'current'
  const canInstallLatest = Boolean(installationMode && hasNewerRelease)
  const rollbackCount = releases.filter((release) =>
    release.tag_name !== currentVersion &&
    compareVersionTags(release.tag_name, currentVersion) < 0
  ).length
  const filteredReleases = useMemo(() => {
    return releases.filter((release) => {
      const isCurrent = release.tag_name === currentVersion
      const comparison = compareVersionTags(release.tag_name, currentVersion)

      if (releaseFilter === 'rollback') return !isCurrent && comparison < 0
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
  const cleanupFileCount = storageInfo
    ? storageInfo.updateCacheCount + Math.max(storageInfo.backupCount - 1, 0)
    : 0

  const getReleaseStatus = (tagName: string) => {
    if (tagName === currentVersion) return t('about.currentStatus')
    return compareVersionTags(tagName, currentVersion) > 0
      ? t('about.newerStatus')
      : t('about.olderStatus')
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
    setCleanupBusy(true)
    setCleanupError(null)
    try {
      const info = await cleanupLauncherUpdateFiles()
      setStorageInfo(info)
      setCleanupConfirmOpen(false)
      setActionError(null)
      setActionMessage(t('about.cleanupDone'))
    } catch (err) {
      setActionMessage(null)
      setCleanupError(err instanceof Error ? err.message : t('about.cleanupError'))
    } finally {
      setCleanupBusy(false)
    }
  }

  const confirmLauncherUpdate = async () => {
    if (!pendingUpdate || !installationMode) return

    if (installationMode === 'portable') {
      setPendingUpdate(null)
      await openReleaseInBrowser(pendingUpdate)
      return
    }

    setUpdating(true)
    setActionError(null)
    try {
      await installLauncherUpdate(pendingUpdate.tag_name)
    } catch (err) {
      setUpdating(false)
      setPendingUpdate(null)
      setActionError(err instanceof Error ? err.message : t('about.updateFailed'))
    }
  }

  return (
    <div className="page about-page">
      <h2 className="visually-hidden">{t('about.title')}</h2>

      <section className="about-hero">
        <div className="about-hero-mark" aria-hidden="true">
          <img src={appIcon} alt="" />
        </div>
        <div className="about-hero-main">
          <h3>Pullora</h3>
          <p>{t('about.updateCenter')}</p>
          <div className="about-hero-meta">
            <div
              className={`about-launcher-status about-launcher-status--${launcherStatus}`}
              role="status"
              aria-live="polite"
            >
              <StatusIcon
                kind={launcherStatus === 'current'
                  ? 'success'
                  : launcherStatus === 'localNewer' || launcherStatus === 'unknown'
                    ? 'warning'
                    : 'info'}
                className="about-launcher-status-icon"
              />
              <strong>{t(`about.launcherStatus.${launcherStatus}`, {
                version: latestRelease?.tag_name.replace(/^v/, '') ?? '',
              })}</strong>
              <span>
                {latestRelease
                  ? t('about.versionRelation', {
                    current: currentVersion.replace(/^v/, ''),
                    latest: latestRelease.tag_name.replace(/^v/, ''),
                  })
                  : t('about.installedVersionOnly', { current: currentVersion.replace(/^v/, '') })}
                {refreshState === 'success' && formattedRefreshTime
                  ? ` · ${t('refresh.updatedAt', { time: formattedRefreshTime })}`
                  : ''}
              </span>
            </div>
            {installationMode && (
              <span className="about-installation-mode">
                {t(installationMode === 'portable' ? 'about.portableMode' : 'about.installedMode')}
              </span>
            )}
          </div>
        </div>
        <div className="about-hero-actions" aria-label={t('about.launcherActions')}>
          {canInstallLatest && (
            <button
              ref={updateButtonRef}
              type="button"
              className="primary-btn release-action-primary"
              onClick={() => {
                if (!latestRelease || !installationMode) return
                if (installationMode === 'portable') {
                  void openReleaseInBrowser(latestRelease)
                } else {
                  setPendingUpdate(latestRelease)
                }
              }}
              disabled={updating}
              aria-busy={updating}
            >
              {updating
                ? t('about.updating')
                : t(installationMode === 'portable' ? 'about.downloadUpdate' : 'about.update')}
            </button>
          )}
          <button type="button" className="secondary-btn" onClick={openLauncherFolder}>
            {t('about.openLauncherFolder')}
          </button>
          <button type="button" className="secondary-btn" onClick={openLatestRelease} disabled={!latestRelease}>
            {t('about.openGitHubRelease')}
          </button>
        </div>
      </section>

      {(actionMessage || actionError) && (
        <div
          className={actionError ? 'about-toast about-toast--error' : 'about-toast about-toast--success'}
          role={actionError ? 'alert' : 'status'}
          aria-live={actionError ? 'assertive' : 'polite'}
          aria-atomic="true"
        >
          <StatusIcon kind={actionError ? 'error' : 'success'} />
          <span>{actionError ?? actionMessage}</span>
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
              </span>
            </div>
            <div className="about-version-filter-group">
              <output className="about-filter-count" aria-live="polite">
                {t('about.availableCount', { count: filteredReleases.length })}
              </output>
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
          </div>
          <div className="about-panel-toolbar" aria-label={t('about.launcherActions')}>
            <button type="button" className="secondary-btn" onClick={() => void loadLauncherReleases(true)} disabled={loadingReleases}>
              {loadingReleases ? t('library.refreshing') : t('library.refresh')}
            </button>
            <button
              ref={cleanupButtonRef}
              type="button"
              className="secondary-btn"
              onClick={() => {
                setCleanupError(null)
                setCleanupConfirmOpen(true)
              }}
              disabled={!storageInfo || storageInfo.cleanupBytes === 0}
            >
              {t('about.cleanupOldVersionsShort')}
            </button>
          </div>
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
              actionLabel={t('about.filter.all')}
              onAction={() => setReleaseFilter('all')}
            />
          )}
          {!loadingReleases && filteredReleases.length > 0 && (
            <div className="about-release-list">
              {filteredReleases.map((release) => {
                const isCurrent = release.tag_name === currentVersion
                const statusClass = isCurrent
                  ? 'current'
                  : compareVersionTags(release.tag_name, currentVersion) > 0
                    ? 'newer'
                    : 'older'
                const menuOpen = menuReleaseId === release.id
                const releaseMenuId = `about-release-menu-${release.id}`

                return (
                  <div
                    key={release.id}
                    className={`about-release-link about-release-link--${statusClass} ${
                      isCurrent ? 'active' : ''
                    }`}
                    aria-label={`${release.tag_name}, ${getReleaseStatus(release.tag_name)}`}
                  >
                    <div className="about-release-orb" aria-hidden="true">
                      <span>{release.tag_name.replace(/^v/i, '').split('.')[0] ?? 'v'}</span>
                    </div>
                    <div className="about-release-main">
                      <div className="about-release-title">
                        <span className="about-release-version" title={release.tag_name}>
                          {release.tag_name}
                        </span>
                        <span className={`about-release-status ${statusClass}`}>
                          {getReleaseStatus(release.tag_name)}
                        </span>
                      </div>
                      <span className="about-release-date">
                        {release.published_at
                          ? formatDate(release.published_at, language)
                          : t('about.noDate')}
                      </span>
                    </div>
                    <div className="about-release-actions">
                      {isCurrent ? (
                        <span className="about-release-active-badge">{t('about.active')}</span>
                      ) : (
                        <button
                          type="button"
                          className="secondary-btn"
                          onClick={() => void openReleaseInBrowser(release)}
                        >
                          {t('about.openGitHubReleaseShort')}
                        </button>
                      )}
                      <div className={`project-actions-menu about-release-menu ${menuOpen ? 'open' : ''}`}>
                        <button
                          ref={menuOpen ? releaseMenuTriggerRef : undefined}
                          type="button"
                          className="project-actions-trigger"
                          aria-haspopup="menu"
                          aria-expanded={menuOpen}
                          aria-controls={menuOpen ? releaseMenuId : undefined}
                          aria-label={t('about.moreActions')}
                          onClick={(event) => {
                            if (menuOpen) {
                              setMenuReleaseId(null)
                              return
                            }
                            const bounds = event.currentTarget.getBoundingClientRect()
                            setReleaseMenuPosition({
                              x: Math.max(8, Math.min(bounds.right - 220, window.innerWidth - 228)),
                              y: bounds.bottom + 7,
                              openUp: bounds.bottom + 180 > window.innerHeight,
                            })
                            setMenuReleaseId(release.id)
                          }}
                        >
                          <MoreHorizontalIcon className="menu-overflow-icon" />
                        </button>
                        {menuOpen && releaseMenuPosition && createPortal(
                          <div
                            ref={releaseMenuRef}
                            className={`project-actions-menu about-release-menu-portal open${
                              releaseMenuPosition.openUp ? ' about-release-menu-portal--up' : ''
                            }`}
                            style={{
                              left: releaseMenuPosition.x,
                              top: releaseMenuPosition.openUp
                                ? Math.max(8, releaseMenuPosition.y - 14)
                                : releaseMenuPosition.y,
                              transform: releaseMenuPosition.openUp ? 'translateY(-100%)' : undefined,
                            }}
                          >
                            <div
                              className="project-actions-popover"
                              id={releaseMenuId}
                              role="menu"
                              tabIndex={-1}
                              aria-label={t('about.moreActions')}
                              onKeyDown={(event) => handleMenuKeyboard(event, () => {
                                setMenuReleaseId(null)
                                releaseMenuTriggerRef.current?.focus()
                              })}
                            >
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  notesReturnFocusRef.current = releaseMenuTriggerRef.current
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
                                  const trigger = releaseMenuTriggerRef.current
                                  setMenuReleaseId(null)
                                  window.requestAnimationFrame(() => trigger?.focus())
                                  void openReleaseInBrowser(release)
                                }}
                              >
                                {t('about.openGitHubReleaseShort')}
                              </button>
                            </div>
                          </div>,
                          document.body,
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

      {notesRelease && createPortal(
        <div className="modal-overlay about-dialog-overlay" role="presentation" onClick={() => setNotesRelease(null)}>
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
              <div className="about-notes-heading">
                <h3 id="about-notes-title">{t('about.releaseNotesPreview')}</h3>
                <div className="about-notes-meta">
                  <span>{t('about.version')} {notesRelease.tag_name}</span>
                  <time dateTime={notesRelease.published_at ?? undefined}>
                    {notesRelease.published_at
                      ? formatDate(notesRelease.published_at, language)
                      : t('about.noDate')}
                  </time>
                </div>
              </div>
              <button
                type="button"
                className="close-btn"
                onClick={() => setNotesRelease(null)}
                aria-label={t('settings.close')}
              >
                <CloseIcon className="dialog-close-icon" />
              </button>
            </div>
            <div className="about-notes-body">
              {/* GitHub release notes stay plain React text; never inject release HTML. */}
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
        </div>,
        document.querySelector('.layout') ?? document.body,
      )}

      {pendingUpdate && createPortal(
        <div
          className="modal-backdrop about-dialog-overlay"
          role="presentation"
          onClick={() => !updating && setPendingUpdate(null)}
        >
          <div
            ref={updateModalRef}
            className="confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="launcher-update-title"
            tabIndex={-1}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="confirm-modal-header">
              <div>
                <span className="confirm-modal-kicker">{t('about.update')}</span>
                <h3 id="launcher-update-title">
                  {t('about.updateConfirmTitle', { version: pendingUpdate.tag_name })}
                </h3>
              </div>
              <button
                type="button"
                className="close-btn confirm-close-btn"
                disabled={updating}
                onClick={() => setPendingUpdate(null)}
                aria-label={t('about.cancel')}
              >
                <CloseIcon className="dialog-close-icon" />
              </button>
            </div>
            <p className="confirm-copy">
              {t('about.updateInstalledDetail')}
            </p>
            <div className="confirm-facts">
              <div><span>{t('about.confirmCurrent')}</span><strong>{currentVersion}</strong></div>
              <div><span>{t('about.confirmTarget')}</span><strong>{pendingUpdate.tag_name}</strong></div>
              <div>
                <span>{t('about.installMode')}</span>
                <strong>{t('about.installedMode')}</strong>
              </div>
            </div>
            <ul className="confirm-list">
              <li>{t('about.confirmSignedUpdate')}</li>
              <li>{t('about.confirmClose')}</li>
            </ul>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-btn"
                disabled={updating}
                onClick={() => setPendingUpdate(null)}
                data-autofocus="true"
              >
                {t('about.cancel')}
              </button>
              <button
                type="button"
                className="primary-btn confirm-primary-btn"
                disabled={updating}
                aria-busy={updating}
                onClick={() => void confirmLauncherUpdate()}
              >
                {updating ? t('about.updating') : t('about.confirmUpdate')}
              </button>
            </div>
          </div>
        </div>,
        document.querySelector('.layout') ?? document.body,
      )}

      {cleanupConfirmOpen && storageInfo && createPortal(
        <div
          className="modal-backdrop about-dialog-overlay"
          role="presentation"
          onClick={() => !cleanupBusy && setCleanupConfirmOpen(false)}
        >
          <div
            ref={cleanupModalRef}
            className="confirm-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="launcher-cleanup-title"
            aria-describedby="launcher-cleanup-description"
            aria-busy={cleanupBusy}
            tabIndex={-1}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="confirm-modal-header">
              <div>
                <span className="confirm-modal-kicker">{t('about.cleanupOldVersions')}</span>
                <h3 id="launcher-cleanup-title">{t('about.cleanupConfirmTitle')}</h3>
              </div>
              <button
                type="button"
                className="close-btn confirm-close-btn"
                disabled={cleanupBusy}
                onClick={() => setCleanupConfirmOpen(false)}
                aria-label={t('about.cancel')}
              >
                <CloseIcon className="dialog-close-icon" />
              </button>
            </div>
            <p id="launcher-cleanup-description" className="confirm-copy">
              {t('about.cleanupConfirm')}
            </p>
            <div className="confirm-facts">
              <div><span>{t('about.cleanupFiles')}</span><strong>{cleanupFileCount}</strong></div>
              <div><span>{t('about.cleanupData')}</span><strong>{formatBytes(storageInfo.cleanupBytes, language)}</strong></div>
            </div>
            {cleanupError && <div className="error-message" role="alert">{cleanupError}</div>}
            <span className="visually-hidden" role="status" aria-live="polite">
              {cleanupBusy ? t('about.cleanupRunning') : ''}
            </span>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-btn"
                disabled={cleanupBusy}
                onClick={() => setCleanupConfirmOpen(false)}
                data-autofocus="true"
              >
                {t('about.cancel')}
              </button>
              <button
                type="button"
                className="uninstall-danger-btn"
                disabled={cleanupBusy}
                onClick={() => void cleanupOldLauncherFiles()}
              >
                {cleanupBusy ? t('about.cleanupRunning') : t('about.cleanupOldVersionsShort')}
              </button>
            </div>
          </div>
        </div>,
        document.querySelector('.layout') ?? document.body,
      )}

    </div>
  )
}

export default AboutPage
