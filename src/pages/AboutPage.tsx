import { useEffect, useState } from 'react'
import { getReleases } from '../services/github'
import { installLauncherRelease } from '../services/updates'
import type { GitHubRelease } from '../types'
import './PageStyles.css'

const LAUNCHER_OWNER = 'CpPrice11'
const LAUNCHER_REPO = 'air-launcher'
const CURRENT_VERSION = 'v0.2.3'

function AboutPage() {
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
    const asset = release.assets.find((item) =>
      item.name.toLowerCase().endsWith('.exe'),
    )

    if (!asset) {
      setInstallError('У цьому релізі немає EXE-файлу.')
      return
    }

    setInstallError(null)
    setInstallingVersion(release.tag_name)
    try {
      await installLauncherRelease(release.tag_name, asset.browser_download_url)
    } catch (err) {
      setInstallError(
        err instanceof Error ? err.message : 'Не вдалося активувати версію лаунчера.',
      )
      setInstallingVersion(null)
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2>Про застосунок</h2>
      </div>

      <div className="about-grid">
        <section className="about-panel">
          <h3>Версія</h3>
          <dl className="about-facts">
            <div>
              <dt>Застосунок</dt>
              <dd>Air Launcher</dd>
            </div>
            <div>
              <dt>Поточна версія</dt>
              <dd>{CURRENT_VERSION.replace(/^v/, '')}</dd>
            </div>
            <div>
              <dt>Стек</dt>
              <dd>Tauri, Rust, React, TypeScript</dd>
            </div>
          </dl>
        </section>

        <section className="about-panel about-panel-wide">
          <h3>Версії лаунчера</h3>
          {installError && <div className="error-banner">{installError}</div>}
          {loadingReleases && <p>Завантажуємо релізи...</p>}
          {!loadingReleases && releases.length === 0 && (
            <p>Релізи лаунчера не вдалося завантажити.</p>
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
                        ? new Date(release.published_at).toLocaleDateString('uk-UA')
                        : 'без дати'}
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
                      ? 'Активна'
                      : installingVersion === release.tag_name
                        ? 'Активуємо...'
                        : release.tag_name > CURRENT_VERSION
                          ? 'Оновити'
                          : 'Відкотитися'}
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
