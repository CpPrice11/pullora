import { useRef, useState } from 'react'
import { pickDirectory } from '../../services/dialog'
import { useI18n } from '../../i18n'
import { useModalFocus } from '../../hooks/useModalFocus'
import './Modal.css'

interface InstallationPathModalProps {
  onPathSelected: (path: string) => Promise<void>
  onSkip?: () => void
}

function InstallationPathModal({ onPathSelected, onSkip }: InstallationPathModalProps) {
  const { t } = useI18n()
  const modalRef = useRef<HTMLDivElement | null>(null)
  const [selectedPath, setSelectedPath] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useModalFocus(modalRef, { onEscape: () => {} })

  const handleBrowse = async () => {
    const dir = await pickDirectory()
    if (dir) setSelectedPath(dir)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedPath.trim()) {
      setError(t('firstRun.pathRequired'))
      return
    }
    setLoading(true)
    setError('')
    try {
      await onPathSelected(selectedPath)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('firstRun.pathError'))
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div
        ref={modalRef}
        className="modal-content"
        role="dialog"
        aria-modal="true"
        aria-labelledby="first-run-title"
        tabIndex={-1}
      >
        <div className="modal-header">
          <h2 id="first-run-title">{t('firstRun.title')}</h2>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <p className="modal-description">
            {t('firstRun.description')}
          </p>

          <div className="form-group">
            <label htmlFor="installPath">{t('settings.installPath')}</label>
            <div className="path-input-group">
              <input
                id="installPath"
                type="text"
                value={selectedPath}
                onChange={(e) => setSelectedPath(e.target.value)}
                placeholder={t('firstRun.pathPlaceholder')}
                disabled={loading}
                data-autofocus="true"
              />
              <button type="button" onClick={handleBrowse} disabled={loading}>
                {t('settings.choose')}
              </button>
            </div>
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="modal-actions">
            {onSkip && (
              <button type="button" className="secondary-btn" onClick={onSkip} disabled={loading}>
                {t('firstRun.skip')}
              </button>
            )}
            <button type="submit" disabled={loading || !selectedPath.trim()}>
              {loading ? t('firstRun.configuring') : t('firstRun.continue')}
            </button>
          </div>
        </form>

        <p className="modal-footer-text">
          {t('firstRun.footer')}
        </p>
      </div>
    </div>
  )
}

export default InstallationPathModal
