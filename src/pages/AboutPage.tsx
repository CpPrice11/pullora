import { useEffect, useState } from 'react'
import { clearGithubCache, getReleases } from '../services/github'
import { installLauncherRelease } from '../services/updates'
import StatePanel from '../components/State/StatePanel'
import type { GitHubAsset, GitHubRelease } from '../types'
import { useI18n } from '../i18n'
import '../components/Modal/Modal.css'
import './PageStyles.css'

const LAUNCHER_OWNER = 'CpPrice11'
const LAUNCHER_REPO = 'air-launcher'
const CURRENT_VERSION = 'v0.7.0'

type PendingLauncherAction = {
  release: GitHubRelease
  asset: GitHubAsset
  action: 'update' | 'rollback'
}

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

  const airLauncherExe = candidates.find((asset) => {
    const name = asset.name.toLowerCase()
    return name.endsWith('.exe') && name.includes('air.launcher')
  })
  if (airLauncherExe) return airLauncherExe

  return candidates.find((asset) => asset.name.toLowerCase().endsWith('.zip')) ??
    candidates.find((asset) => asset.name.toLowerCase().endsWith('.exe')) ??
    null
}

function AboutPage() {
  const { language, t } = useI18n()
  const [releases, setReleases] = useState<GitHubRelease[]>([])
  const [loadingReleases, setLoadingReleases] = useState(true)
  const [releaseLoadError, setReleaseLoadError] = useState<string | null>(null)
  const [installingVersion, setInstallingVersion] = useState<string | null>(null)
  const [installError, setInstallError] = useState<string | null>(null)
  const [refreshState, setRefreshState] = useState<'idle' | 'success' | 'error'>('idle')
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null)
  const [pendingAction, setPendingAction] = useState<PendingLauncherAction | null>(null)

  const loadLauncherReleases = async () => {
    setRefreshState('idle')
    setLoadingReleases(true)
    setReleaseLoadError(null)
    try {
      await clearGithubCache()
      const items = await getReleases(LAUNCHER_OWNER, LAUNCHER_REPO)
      setReleases(items)
      setInstallError(null)
      setLastRefreshedAt(new Date())
      setRefreshState('success')
    } catch (err) {
      setReleases([])
      setReleaseLoadError(err instanceof Error ? err.message : t('about.noReleases'))
      setRefreshState('error')
    } finally {
      setLoadingReleases(false)
    }
  }

  useEffect(() => {
    loadLauncherReleases()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const getReleaseStatus = (tagName: string, hasPortableAsset: boolean) => {
    if (!hasPortableAsset) return t('about.portableUnavailableStatus')
    if (tagName === CURRENT_VERSION) return t('about.currentStatus')
    return compareVersionTags(tagName, CURRENT_VERSION) > 0
      ? t('about.newerStatus')
      : t('about.olderStatus')
  }

  const formattedRefreshTime = lastRefreshedAt
    ? lastRefreshedAt.toLocaleTimeString(language === 'en' ? 'en-US' : 'uk-UA', {
      hour: '2-digit',
      minute: '2-digit',
    })
    : null

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
      action: compareVersionTags(release.tag_name, CURRENT_VERSION) > 0 ? 'update' : 'rollback',
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

  return (
    <div className="page">
      <div className="page-header">
        <h2>{t('about.title')}</h2>
      </div>

      <div className="about-grid">
        <section className="about-panel">
          <h3>{t('about.version')}</h3>
          <dl className="about-facts">
            <div>
              <dt>{t('about.app')}</dt>
              <dd>Air Launcher</dd>
            </div>
            <div>
              <dt>{t('about.currentVersion')}</dt>
              <dd>{CURRENT_VERSION.replace(/^v/, '')}</dd>
            </div>
            <div>
              <dt>{t('about.stack')}</dt>
              <dd>Tauri, Rust, React, TypeScript</dd>
            </div>
          </dl>
        </section>

        <section className="about-panel about-panel-wide">
          <div className="section-heading-row">
            <h3>{t('about.launcherVersions')}</h3>
            <div className="page-actions">
              {refreshState === 'success' && formattedRefreshTime && (
                <span className="refresh-status success">
                  {t('refresh.updatedAt', { time: formattedRefreshTime })}
                </span>
              )}
              {refreshState === 'error' && (
                <span className="refresh-status error">{t('refresh.error')}</span>
              )}
              <button
                type="button"
                className="refresh-btn"
                onClick={loadLauncherReleases}
                disabled={loadingReleases || installingVersion !== null}
              >
                {loadingReleases ? t('library.refreshing') : t('library.refresh')}
              </button>
            </div>
          </div>
          {installError && (
            <div className="error-banner about-recovery-banner">
              <div>
                <strong>{installError}</strong>
                <span>{t('about.recoveryHint')}</span>
              </div>
              <button type="button" onClick={loadLauncherReleases}>
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
              onAction={loadLauncherReleases}
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
              onAction={loadLauncherReleases}
            />
          )}
          {!loadingReleases && releases.length > 0 && (
            <div className="about-release-list">
              {releases.map((release) => {
                const portableAsset = pickPortableLauncherAsset(release.assets)
                const isCurrent = release.tag_name === CURRENT_VERSION
                const canActivate = Boolean(portableAsset) && !isCurrent
                const statusClass = !portableAsset
                  ? 'missing'
                  : isCurrent
                    ? 'current'
                    : compareVersionTags(release.tag_name, CURRENT_VERSION) > 0
                      ? 'newer'
                      : 'older'

                return (
                  <div
                    key={release.id}
                    className={`about-release-link ${
                      isCurrent ? 'active' : ''
                    }`}
                  >
                    <div className="about-release-main">
                      <div className="about-release-title">
                        <span>{release.tag_name}</span>
                        <span className={`about-release-status ${statusClass}`}>
                          {getReleaseStatus(release.tag_name, Boolean(portableAsset))}
                        </span>
                      </div>
                      <span>
                        {release.published_at
                          ? new Date(release.published_at).toLocaleDateString(language === 'en' ? 'en-US' : 'uk-UA')
                          : t('about.noDate')}
                      </span>
                      {portableAsset ? (
                        <span>{t('about.portableAsset', { name: portableAsset.name })}</span>
                      ) : (
                        <span className="about-release-warning">{t('about.noPortableHint')}</span>
                      )}
                      <span className={portableAsset ? 'about-release-ready' : 'about-release-warning'}>
                        {portableAsset ? t('about.portableReady') : t('about.portableMissing')}
                      </span>
                    </div>
                    <div className="about-release-actions">
                      <button
                        type="button"
                        className="secondary-btn"
                        disabled={!canActivate || installingVersion !== null}
                        onClick={() => requestActivateRelease(release)}
                      >
                        {isCurrent
                          ? t('about.active')
                          : installingVersion === release.tag_name
                            ? t('about.activating')
                            : compareVersionTags(release.tag_name, CURRENT_VERSION) > 0
                              ? t('about.update')
                              : t('about.rollback')}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>

      {pendingAction && (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={() => {
            if (!installingVersion) setPendingAction(null)
          }}
        >
          <div
            className="modal-content confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="launcher-confirm-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="launcher-confirm-title">
              {pendingAction.action === 'update'
                ? t('about.updateConfirmTitle', { version: pendingAction.release.tag_name })
                : t('about.rollbackConfirmTitle', { version: pendingAction.release.tag_name })}
            </h3>
            <div className="confirm-facts">
              <div>
                <span>{t('about.confirmCurrent')}</span>
                <strong>{CURRENT_VERSION}</strong>
              </div>
              <div>
                <span>{t('about.confirmTarget')}</span>
                <strong>{pendingAction.release.tag_name}</strong>
              </div>
              <div>
                <span>{t('about.confirmAsset')}</span>
                <strong>{pendingAction.asset.name}</strong>
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
              >
                {t('about.cancel')}
              </button>
              <button
                type="button"
                className="primary-btn"
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
