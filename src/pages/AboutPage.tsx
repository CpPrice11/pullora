import { useEffect, useState } from 'react'
import { getReleases } from '../services/github'
import { installLauncherRelease } from '../services/updates'
import type { GitHubRelease } from '../types'
import './PageStyles.css'

const LAUNCHER_OWNER = 'CpPrice11'
const LAUNCHER_REPO = 'air-launcher'
const CURRENT_VERSION = 'v0.1.4'

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
        <div>
          <h2>Про застосунок</h2>
          <p className="page-subtitle">
            Air Launcher допомагає встановлювати й запускати програми з твоїх публічних GitHub Releases.
          </p>
        </div>
      </div>

      <div className="about-grid">
        <section className="about-panel">
          <h3>Що це</h3>
          <p>
            Легкий десктопний лаунчер для твоїх публічних репозиторіїв GitHub.
            Він показує проєкти з релізами, завантажує файли релізу, встановлює
            їх локально і запускає активну версію.
          </p>
        </section>

        <section className="about-panel">
          <h3>Принципи</h3>
          <ul>
            <li>Бібліотека показує тільки твої публічні проєкти з релізами.</li>
            <li>Сам Air Launcher не показується у бібліотеці застосунків.</li>
            <li>Пріоритет для portable ZIP, потім EXE або MSI.</li>
            <li>Build-файли не зберігаються в Git-проєкті.</li>
          </ul>
        </section>

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
          <h3>Релізи Air Launcher</h3>
          {installError && <div className="error-banner">Увага: {installError}</div>}
          {loadingReleases && <p>Завантажуємо релізи...</p>}
          {!loadingReleases && releases.length === 0 && (
            <p>Релізи лаунчера поки що не вдалося завантажити.</p>
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
                        : 'Активувати'}
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
