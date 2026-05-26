import { useRef } from 'react'
import { useI18n } from '../../i18n'
import { useModalFocus } from '../../hooks/useModalFocus'
import '../Modal/Modal.css'
import './SearchComponents.css'

interface SwitchVersionConfirmModalProps {
  appName: string
  currentVersion: string
  targetVersion: string
  busy?: boolean
  error?: string | null
  onCancel: () => void
  onConfirm: () => Promise<void> | void
}

function SwitchVersionConfirmModal({
  appName,
  currentVersion,
  targetVersion,
  busy = false,
  error,
  onCancel,
  onConfirm,
}: SwitchVersionConfirmModalProps) {
  const { t } = useI18n()
  const modalRef = useRef<HTMLDivElement | null>(null)

  useModalFocus(modalRef, { onEscape: busy ? undefined : onCancel })

  return (
    <div className="modal-overlay app-action-overlay" onClick={() => !busy && onCancel()}>
      <div
        ref={modalRef}
        className="modal-content version-switch-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="switch-version-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="version-switch-header">
          <div>
            <span className="app-action-kicker">{t('details.switchKicker')}</span>
            <h2 id="switch-version-title">{t('details.switchTitle', { name: appName })}</h2>
          </div>
          <button
            type="button"
            className="close-btn"
            onClick={onCancel}
            disabled={busy}
            aria-label={t('release.close')}
          >
            {'\u00d7'}
          </button>
        </header>

        <div className="version-switch-body">
          <p>{t('details.switchText')}</p>
          <div className="version-switch-facts">
            <div>
              <span>{t('details.activeVersion')}</span>
              <strong>{currentVersion}</strong>
            </div>
            <div>
              <span>{t('details.switchTarget')}</span>
              <strong>{targetVersion}</strong>
            </div>
          </div>
          {error && <div className="error-message">{error}</div>}
          <div className="version-switch-actions">
            <button type="button" className="secondary-btn" onClick={onCancel} disabled={busy}>
              {t('installed.uninstallCancel')}
            </button>
            <button
              type="button"
              className="hero-primary-btn"
              onClick={() => void onConfirm()}
              disabled={busy}
              data-autofocus="true"
            >
              {busy ? t('details.working') : t('details.switchConfirmAction')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SwitchVersionConfirmModal
