import { useEffect, useState } from 'react'
import { getReleases } from '../services/github'
import { installLauncherRelease } from '../services/updates'
import type { GitHubAsset, GitHubRelease } from '../types'
import { useI18n } from '../i18n'
import './PageStyles.css'

const LAUNCHER_OWNER = 'CpPrice11'
const LAUNCHER_REPO = 'air-launcher'
const CURRENT_VERSION = 'v0.2.4'

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
  const [installingVersion, setInstallingVersion] = useState<string | null>(null)
  const [installError, setInstallError] = useState<string | null>(null)

  useEffect(() => {
    getReleases(LAUNCHER_OWNER, LAUNCHER_REPO)
      .then(setReleases)
      .catch(() => setReleases([]))
      .finally(() => setLoadingReleases(false))
  }, [])

  const handleActivateRelease = async (release: GitHubRelease) => {
    const asset = pickPortableLauncherAsset(release.assets)

    if (!asset) {
      setInstallError(t('about.noPortableAsset'))
      return
    }

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
          {loadingReleases && <p>{t('about.loadingReleases')}</p>}
          {!loadingReleases && releases.length === 0 && (
            <p>{t('about.noReleases')}</p>
          )}
          {!loadingReleases && releases.length > 0 && (
            <div className="about-release-list">
              {releases.map((release) => (
                <div
                  key={release.id}
                  className={`about-release-link ${
                    release.tag_name === CURRENT_VERSION ? 'active' : ''
                  }`}
                >
                  <div>
                    <span>{release.tag_name}</span>
                    <span>
                      {release.published_at
                        ? new Date(release.published_at).toLocaleDateString(language === 'en' ? 'en-US' : 'uk-UA')
                        : t('about.noDate')}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="secondary-btn"
                    disabled={
                      release.tag_name === CURRENT_VERSION ||
                      installingVersion !== null
                    }
                    onClick={() => handleActivateRelease(release)}
                  >
                    {release.tag_name === CURRENT_VERSION
                      ? t('about.active')
                      : installingVersion === release.tag_name
                        ? t('about.activating')
                        : release.tag_name > CURRENT_VERSION
                          ? t('about.update')
                          : t('about.rollback')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

export default AboutPage
