import { useI18n } from '../../../i18n'
import type { InstalledApp } from '../../../types'
import { formatDate, formatNumber } from '../../../utils/format'

interface VersionPanelProps {
  repoName: string
  installedApp?: InstalledApp
  latestVersion?: string | null
}

export default function VersionPanel({ repoName, installedApp, latestVersion }: VersionPanelProps) {
  const { language, t } = useI18n()
  const versions = installedApp?.versions ?? []

  return (
    <section
      className="library-inline-panel library-inline-panel--versions library-inline-panel--default"
      aria-label={t('repo.versions')}
    >
      <div className="library-inline-panel-head">
        <div>
          <span>{t('repo.versions')}</span>
          <strong>{repoName}</strong>
        </div>
      </div>
      <div className="library-inline-summary">
        <div>
          <span>{t('details.activeVersion')}</span>
          <strong>{installedApp?.activeVersion ?? t('release.notInstalled')}</strong>
        </div>
        <div>
          <span>{t('details.latestVersion')}</span>
          <strong>{latestVersion ?? t('library.ops.notChecked')}</strong>
        </div>
        <div>
          <span>{t('details.localVersions')}</span>
          <strong>{formatNumber(versions.length, language)}</strong>
        </div>
      </div>
      <div className="library-inline-version-list">
        {versions.length > 0 ? versions.map((version) => {
          const isActive = version.tag === installedApp?.activeVersion
          return (
            <div key={version.tag} className={`library-inline-version-row ${isActive ? 'active' : ''}`}>
              <div>
                <strong>{version.tag}</strong>
                <span>{formatDate(version.installedAt, language)}</span>
              </div>
              <span>{isActive ? t('installed.active') : t('details.versionStateOlder')}</span>
            </div>
          )
        }) : (
          <p className="library-inline-empty">{t('release.notInstalled')}</p>
        )}
      </div>
    </section>
  )
}
