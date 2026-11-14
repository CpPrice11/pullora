import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useModalFocus } from '../../../hooks/useModalFocus'
import { useI18n } from '../../../i18n'
import { stopApp } from '../../../services/installed'
import type { GitHubSearchResult } from '../../../types'
import '../../../components/Modal/Modal.css'
import './SearchComponents.css'

interface StopAppDialogProps {
  repo: GitHubSearchResult
  onCancel: () => void
  onRefresh: () => Promise<void>
  onStopped: () => void
}

export default function StopAppDialog({ repo, onCancel, onRefresh, onStopped }: StopAppDialogProps) {
  const { t } = useI18n()
  const dialog = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useModalFocus(dialog, { onEscape: () => {
    if (!busy) onCancel()
  } })

  const confirm = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    dialog.current?.focus()
    try {
      await stopApp(repo.owner.login, repo.name)
    } catch (error) {
      await onRefresh()
      setError(error instanceof Error ? error.message : t('errors.stopFailed'))
      setBusy(false)
      return
    }
    await onRefresh()
    onStopped()
  }

  return createPortal(
    <div className="modal-overlay uninstall-overlay">
      <div ref={dialog} className="modal-content uninstall-confirm-modal" role="alertdialog"
        aria-modal="true" aria-labelledby="stop-app-title" aria-describedby="stop-app-description"
        aria-busy={busy} tabIndex={-1}>
        <header className="uninstall-confirm-header">
          <h2 id="stop-app-title">{t('repo.stopTitle', { name: repo.name })}</h2>
        </header>
        <div className="uninstall-confirm-body">
          <p id="stop-app-description" className="uninstall-confirm-copy">{t('repo.stopWarning')}</p>
          {error && <div className="error-message" role="alert">{error}</div>}
          <div className="uninstall-confirm-actions">
            <button type="button" className="secondary-btn" data-autofocus="true" disabled={busy}
              onClick={onCancel}>{t('installed.uninstallCancel')}</button>
            <button type="button" className="uninstall-danger-btn" disabled={busy}
              onClick={() => void confirm()}>{t(busy ? 'repo.busy' : 'repo.stop')}</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
