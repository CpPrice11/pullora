import { useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { InstalledApp } from '../../../types'
import { useI18n } from '../../../i18n'
import { useModalFocus } from '../../../hooks/useModalFocus'
import { CloseIcon } from '../../../components/ui/Icons'
import '../../../components/Modal/Modal.css'
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
  const titleId = useId()
  const descriptionId = useId()
  const targetVersion = tag ?? installedApp.activeVersion
  const removesAll = scope === 'app'

  useModalFocus(modalRef)

  const dialog = (
    <div
      className="modal-overlay uninstall-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel()
      }}
    >
      <div
        ref={modalRef}
        className="modal-content uninstall-confirm-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={busy}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return
          event.preventDefault()
          event.stopPropagation()
          if (!busy) onCancel()
        }}
      >
        <header className="uninstall-confirm-header">
          <div>
            <span className="uninstall-confirm-kicker">{t('installed.uninstallKicker')}</span>
            <h2 id={titleId}>
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
            <CloseIcon className="dialog-close-icon" />
          </button>
        </header>

        <div className="uninstall-confirm-body">
          <p id={descriptionId} className="uninstall-confirm-copy">
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

          {error && <div className="error-message" role="alert">{error}</div>}

          <span className="visually-hidden" role="status" aria-live="polite">
            {busy ? t('installed.uninstalling') : ''}
          </span>

          <div className="uninstall-confirm-actions">
            <button type="button" className="secondary-btn" onClick={onCancel} disabled={busy} data-autofocus="true">
              {t('installed.uninstallCancel')}
            </button>
            <button
              type="button"
              className="uninstall-danger-btn"
              onClick={() => void onConfirm()}
              disabled={busy}
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

  return typeof document === 'undefined'
    ? dialog
    : createPortal(dialog, document.querySelector('.layout') ?? document.body)
}

export default UninstallConfirmModal
