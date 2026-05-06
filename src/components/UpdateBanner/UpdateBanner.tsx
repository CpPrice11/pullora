import type { UpdateAvailable } from '../../types'
import './UpdateBanner.css'

interface UpdateBannerProps {
  updates: UpdateAvailable[]
  onDismiss: (owner: string, repo: string) => void
  onInstall: (update: UpdateAvailable) => void
}

function UpdateBanner({ updates, onDismiss, onInstall }: UpdateBannerProps) {
  if (updates.length === 0) return null

  return (
    <div className="update-banner">
      <div className="update-banner-header">
        <span className="update-icon">↻</span>
        <strong>
          {updates.length === 1
            ? `Доступне оновлення для ${updates[0].appName}`
            : `Доступно оновлень: ${updates.length}`}
        </strong>
      </div>

      <div className="update-list">
        {updates.map((update) => (
          <div key={`${update.owner}/${update.repo}`} className="update-row">
            <span className="update-name">{update.appName}</span>
            <span className="update-versions">
              {update.currentVersion} {'->'} <strong>{update.latestVersion}</strong>
            </span>
            <div className="update-actions">
              <button className="update-install-btn" onClick={() => onInstall(update)}>
                Встановити
              </button>
              <button
                className="update-dismiss-btn"
                onClick={() => onDismiss(update.owner, update.repo)}
                title="Сховати"
              >
                Закрити
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default UpdateBanner
