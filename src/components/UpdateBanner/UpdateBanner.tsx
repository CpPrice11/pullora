import type { UpdateAvailable } from '../../types'
import { useI18n } from '../../i18n'
import './UpdateBanner.css'

interface UpdateBannerProps {
  updates: UpdateAvailable[]
  onDismiss: (owner: string, repo: string) => void
  onInstall: (update: UpdateAvailable) => void
}

function UpdateBanner({ updates, onDismiss, onInstall }: UpdateBannerProps) {
  const { t } = useI18n()

  if (updates.length === 0) return null

  return (
    <div className="update-banner" role="status" aria-live="polite">
      <div className="update-banner-mark" aria-hidden="true">
        <span>{updates.length}</span>
      </div>
      <div className="update-banner-header">
        <span className="update-icon" aria-hidden="true">{'\u21bb'}</span>
        <strong>
          {updates.length === 1
            ? t('updates.one', { name: updates[0].appName })
            : t('updates.many', { count: updates.length })}
        </strong>
      </div>

      <div className="update-list">
        {updates.map((update) => (
          <div key={`${update.owner}/${update.repo}`} className="update-row">
            <span className="update-name-block">
              <span className="update-name">{update.appName}</span>
              <span className="update-source">{update.owner}/{update.repo}</span>
            </span>
            <span className="update-versions">
              <span>{update.currentVersion}</span>
              <span aria-hidden="true">{'->'}</span>
              <strong>{update.latestVersion}</strong>
            </span>
            <div className="update-actions">
              <button type="button" className="update-install-btn" onClick={() => onInstall(update)}>
                {t('updates.install')}
              </button>
              <button
                type="button"
                className="update-dismiss-btn"
                onClick={() => onDismiss(update.owner, update.repo)}
                title={t('updates.hide')}
                aria-label={t('updates.hide')}
              >
                {t('updates.close')}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default UpdateBanner
