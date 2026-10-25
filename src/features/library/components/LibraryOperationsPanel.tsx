import { useI18n } from '../../../i18n'
import type { GitHubSearchResult, InstalledApp, InstallationStatus } from '../../../types'
import { formatDate } from '../../../utils/format'
import { getLibraryAppStatus } from '../libraryStatus'
import ApplicationDetails from './ApplicationDetails'
import VersionPanel from './VersionPanel'

interface LibraryOperationsPanelProps {
  repo: GitHubSearchResult
  installedApp?: InstalledApp
  installationHealth?: InstallationStatus
  latestVersion?: string | null
  installationPath?: string | null
  updating?: boolean
  runtimeStatus?: 'running' | 'unknown'
  onInstall: () => void
  onUpdate: () => void
  onLaunch: () => void
}

export default function LibraryOperationsPanel({
  repo,
  installedApp,
  latestVersion,
  installationPath,
  updating = false,
  runtimeStatus,
  installationHealth,
  onInstall,
  onUpdate,
  onLaunch,
}: LibraryOperationsPanelProps) {
  const { language, t } = useI18n()
  const status = getLibraryAppStatus(installedApp, latestVersion)
  const hasUpdate = status === 'update'
  const actionBusy = !repo.website_url && (updating || Boolean(runtimeStatus) || installationHealth === 'unavailable')
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
            {t(repo.website_url ? 'repo.webApp' : `repo.${status}`)}
          </span>
        </div>

        <div className="library-ops-action-row" aria-label={t('library.action')}>
          <button
            type="button"
            className="hero-primary-btn"
            onClick={repo.website_url ? onInstall : installationHealth === 'missing' ? onInstall : hasUpdate ? onUpdate : installedApp ? onLaunch : onInstall}
            disabled={actionBusy}
            aria-busy={updating}
          >
            {repo.website_url ? t('repo.visit') : runtimeStatus ? t(runtimeStatus === 'running' ? 'repo.running' : 'repo.runtimeUnknown') : installationHealth === 'unavailable' ? t('repo.filesUnavailable') : actionBusy
              ? t('updates.updatingAll')
              : installationHealth === 'missing' ? t('repo.reinstall') : hasUpdate
                ? t('repo.updateAction')
                : installedApp
                  ? t('repo.launch')
                  : t('repo.install')}
          </button>
          <div className="library-play-status">
            <span>{t('library.ops.updated')}</span>
            <strong>{updatedDate}</strong>
          </div>
          {!repo.website_url && <div className="library-play-status">
            <span>{t('library.ops.active')}</span>
            <strong>{installedApp?.activeVersion ?? t('library.ops.notInstalled')}</strong>
          </div>}
          <div className="library-play-status">
            <span>{t('library.ops.language')}</span>
            <strong>{repo.language ?? t('details.unknown')}</strong>
          </div>
        </div>
      </section>

      <div className="library-inline-overview-grid">
        {!repo.website_url && <VersionPanel
          repoName={repo.name}
          installedApp={installedApp}
          latestVersion={latestVersion}
        />}
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
