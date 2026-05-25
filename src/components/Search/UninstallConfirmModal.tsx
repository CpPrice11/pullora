import { useRef } from 'react'
import type { InstalledApp } from '../../types'
import { useI18n } from '../../i18n'
import { useModalFocus } from '../../hooks/useModalFocus'
import '../Modal/Modal.css'
import './SearchComponents.css'

interface UninstallConfirmModalProps {
  installedApp: InstalledApp
  appPath: string
  scope: 'app' | 'version'
  tag?: string
  busy?: boolean
  error?: string | null
  onCancel: () => void
  onConfirm: () => Promise<void> | void
}

function UninstallConfirmModal({
  installedApp,
  appPath,
  scope,
  tag,
  busy = false,
  error,
  onCancel,
  onConfirm,
}: UninstallConfirmModalProps) {
  const { t } = useI18n()
  const modalRef = useRef<HTMLDivElement | null>(null)
  const targetVersion = tag ?? installedApp.activeVersion
  const removesAll = scope === 'app'

  useModalFocus(modalRef, { onEscape: busy ? undefined : onCancel })

  return (
    <div className="modal-overlay uninstall-overlay" onClick={() => !busy && onCancel()}>
      <div
        ref={modalRef}
        className="modal-content uninstall-confirm-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="uninstall-confirm-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="uninstall-confirm-header">
          <div>
            <span className="uninstall-confirm-kicker">{t('installed.uninstallKicker')}</span>
            <h2 id="uninstall-confirm-title">
              {t(removesAll ? 'installed.uninstallAppTitle' : 'installed.uninstallVersionTitle', {
                name: installedApp.name,
                version: targetVersion,
              })}
            </h2>
          </div>
          <button
            type="button"
            className="close-btn"
            aria-label={t('release.close')}
            disabled={busy}
            onClick={onCancel}
          >
            {'\u00d7'}
          </button>
        </header>

        <div className="uninstall-confirm-body">
          <p className="uninstall-confirm-copy">
            {t(removesAll ? 'installed.uninstallCopyApp' : 'installed.uninstallCopyVersion')}
          </p>

          <div className="uninstall-confirm-facts">
            <div>
              <span>{t('details.app')}</span>
              <strong>{installedApp.name}</strong>
            </div>
            <div>
              <span>{t(removesAll ? 'installed.uninstallActiveVersion' : 'installed.uninstallTargetVersion')}</span>
              <strong>{targetVersion}</strong>
            </div>
            {removesAll && (
              <div>
                <span>{t('installed.uninstallVersionsCount')}</span>
                <strong>{installedApp.versions.length}</strong>
              </div>
            )}
            <div className="uninstall-confirm-path">
              <span>{t('installed.uninstallFolder')}</span>
              <strong>{appPath || t('details.unknown')}</strong>
            </div>
          </div>

          <div className="uninstall-confirm-warning">
            <strong>{t('installed.uninstallRemovesTitle')}</strong>
            <p>
              {t(removesAll ? 'installed.uninstallAppRemoves' : 'installed.uninstallVersionRemoves', {
                count: installedApp.versions.length,
                version: targetVersion,
              })}
            </p>
            {removesAll && <p>{t('installed.uninstallFolderWarning')}</p>}
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="uninstall-confirm-actions">
            <button type="button" className="secondary-btn" onClick={onCancel} disabled={busy}>
              {t('installed.uninstallCancel')}
            </button>
            <button
              type="button"
              className="uninstall-danger-btn"
              onClick={() => void onConfirm()}
              disabled={busy}
              data-autofocus="true"
            >
              {busy
                ? t('installed.uninstalling')
                : t(removesAll ? 'installed.uninstallConfirmApp' : 'installed.uninstallConfirmVersion')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default UninstallConfirmModal
