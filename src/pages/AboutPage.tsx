import { useEffect, useState } from 'react'
import { getReleases } from '../services/github'
import { installLauncherRelease } from '../services/updates'
import type { GitHubAsset, GitHubRelease } from '../types'
import { useI18n } from '../i18n'
import './PageStyles.css'

const LAUNCHER_OWNER = 'CpPrice11'
const LAUNCHER_REPO = 'air-launcher'
const CURRENT_VERSION = 'v0.2.7'

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

  const loadLauncherReleases = () => {
    setLoadingReleases(true)
    setReleaseLoadError(null)
    getReleases(LAUNCHER_OWNER, LAUNCHER_REPO)
      .then((items) => {
        setReleases(items)
        setInstallError(null)
      })
      .catch((err) => {
        setReleases([])
        setReleaseLoadError(err instanceof Error ? err.message : t('about.noReleases'))
      })
      .finally(() => setLoadingReleases(false))
  }

  useEffect(() => {
    loadLauncherReleases()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const getReleaseStatus = (tagName: string) => {
    if (tagName === CURRENT_VERSION) return t('about.currentStatus')
    return tagName > CURRENT_VERSION ? t('about.newerStatus') : t('about.olderStatus')
  }

  const handleActivateRelease = async (release: GitHubRelease) => {
    const asset = pickPortableLauncherAsset(release.assets)

    if (!asset) {
      setInstallError(t('about.noPortableAsset'))
      return
    }

    const confirmation = release.tag_name > CURRENT_VERSION
      ? t('about.updateConfirm', { version: release.tag_name })
      : t('about.rollbackConfirm', { version: release.tag_name })

    if (!window.confirm(confirmation)) return

    setInstallError(null)
    setInstallingVersion(release.tag_name)
    try {
      await installLauncherRelease(release.tag_name, asset.browser_download_url, asset.name)
    } catch (err) {
      setInstallError(
        err instanceof Error ? err.message : t('about.activateError'),
      )
      setInstallingVersion(null)
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
          <h3>{t('about.launcherVersions')}</h3>
          {installError && <div className="error-banner">{installError}</div>}
          {releaseLoadError && (
            <div className="error-banner">
              <span>{releaseLoadError}</span>
              <button type="button" onClick={loadLauncherReleases}>
                {t('about.retry')}
              </button>
            </div>
          )}
          {loadingReleases && <p>{t('about.loadingReleases')}</p>}
          {!loadingReleases && releases.length === 0 && !releaseLoadError && (
            <div className="empty-state">
              <h3>{t('about.noReleases')}</h3>
              <button type="button" className="secondary-btn" onClick={loadLauncherReleases}>
                {t('about.retry')}
              </button>
            </div>
          )}
          {!loadingReleases && releases.length > 0 && (
            <div className="about-release-list">
              {releases.map((release) => {
                const portableAsset = pickPortableLauncherAsset(release.assets)
                const isCurrent = release.tag_name === CURRENT_VERSION
                const canActivate = Boolean(portableAsset) && !isCurrent

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
                        <span className={`about-release-status ${isCurrent ? 'current' : ''}`}>
                          {getReleaseStatus(release.tag_name)}
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
                      {!isCurrent && portableAsset && (
                        <span className="about-release-note">{t('about.restartNotice')}</span>
                      )}
                      <button
                        type="button"
                        className="secondary-btn"
                        disabled={!canActivate || installingVersion !== null}
                        onClick={() => handleActivateRelease(release)}
                      >
                        {isCurrent
                          ? t('about.active')
                          : installingVersion === release.tag_name
                            ? t('about.activating')
                            : release.tag_name > CURRENT_VERSION
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
    </div>
  )
}

export default AboutPage
