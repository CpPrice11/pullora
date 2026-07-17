import { useI18n } from '../../../i18n'
import type { GitHubSearchResult, InstalledApp } from '../../../types'
import { formatDate } from '../../../utils/format'
import { getLibraryAppStatus } from '../libraryStatus'
import ApplicationDetails from './ApplicationDetails'
import VersionPanel from './VersionPanel'

interface LibraryOperationsPanelProps {
  repo: GitHubSearchResult
  installedApp?: InstalledApp
  latestVersion?: string | null
  installationPath?: string | null
  onInstall: () => void
  onLaunch: () => void
}

export default function LibraryOperationsPanel({
  repo,
  installedApp,
  latestVersion,
  installationPath,
  onInstall,
  onLaunch,
}: LibraryOperationsPanelProps) {
  const { language, t } = useI18n()
  const status = getLibraryAppStatus(installedApp, latestVersion)
  const hasUpdate = status === 'update'
  const updatedDate = formatDate(repo.updated_at, language)
  const installPath = installationPath && installedApp
    ? `${installationPath}\\${installedApp.owner}-${installedApp.repo}`
    : null

  return (
    <>
      <section className={`library-ops-panel ${status}`} aria-label={t('library.ops.title')}>
        <div className="library-ops-header">
          <div>
            <span className="library-ops-kicker">{t('library.ops.kicker')}</span>
            <h3>{t('library.ops.title')}</h3>
          </div>
          <span className={`library-ops-state ${status}`}>
            {t(`repo.${status}`)}
          </span>
        </div>

        <div className="library-ops-action-row" aria-label={t('library.action')}>
          <button type="button" className="hero-primary-btn" onClick={installedApp && !hasUpdate ? onLaunch : onInstall}>
            {hasUpdate ? t('repo.updateAction') : installedApp ? t('repo.launch') : t('repo.install')}
          </button>
          <div className="library-play-status">
            <span>{t('library.ops.updated')}</span>
            <strong>{updatedDate}</strong>
          </div>
          <div className="library-play-status">
            <span>{t('library.ops.active')}</span>
            <strong>{installedApp?.activeVersion ?? t('library.ops.notInstalled')}</strong>
          </div>
          <div className="library-play-status">
            <span>{t('library.ops.language')}</span>
            <strong>{repo.language ?? t('details.unknown')}</strong>
          </div>
        </div>
      </section>

      <div className="library-inline-overview-grid">
        <VersionPanel
          repoName={repo.name}
          installedApp={installedApp}
          latestVersion={latestVersion}
        />
        <ApplicationDetails
          repo={repo}
          updatedDate={updatedDate}
          latestVersion={latestVersion}
          installPath={installPath}
        />
      </div>
    </>
  )
}
