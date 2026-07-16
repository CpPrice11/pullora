import { useRef, useState, type ReactNode } from 'react'
import { useModalFocus } from '../../../hooks/useModalFocus'
import { useI18n } from '../../../i18n'
import type { GitHubSearchResult } from '../../../types'
import '../../../components/Modal/Modal.css'

export interface BatchUpdateItem {
  repo: GitHubSearchResult
  currentVersion: string
  latestVersion: string
}

interface BatchUpdatePanelProps {
  items: BatchUpdateItem[]
  skippedCount: number
  lastChecked?: string | null
  checking: boolean
  updating: boolean
  versionErrorCount: number
  updateMessage?: string | null
  cleanupMessage?: string | null
  error?: string | null
  children?: ReactNode
  onCheck: () => void
  onUpdateAll: () => void
  onClearSkipped: () => void
  onUpdate: (repo: GitHubSearchResult) => void
  onShowDetails: (repo: GitHubSearchResult) => void
  onSkip: (repo: GitHubSearchResult) => void
}

interface BatchUpdateConfirmDialogProps {
  items: BatchUpdateItem[]
  onCancel: () => void
  onConfirm: () => void
}

export function BatchUpdateConfirmDialog({
  items,
  onCancel,
  onConfirm,
}: BatchUpdateConfirmDialogProps) {
  const { t } = useI18n()
  const modalRef = useRef<HTMLDivElement | null>(null)
  const visibleItems = items.slice(0, 6)

  useModalFocus(modalRef, { onEscape: onCancel })

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        id="batch-update-confirm-dialog"
        ref={modalRef}
        className="modal-content batch-update-confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="batch-update-confirm-title"
        aria-describedby="batch-update-confirm-description"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <span className="updates-center-kicker">{t('updates.confirmKicker')}</span>
          <h2 id="batch-update-confirm-title">
            {t('updates.confirmTitle', { count: items.length })}
          </h2>
        </header>

        <div className="modal-form">
          <p id="batch-update-confirm-description" className="modal-description">
            {t('updates.confirmText')}
          </p>

          <ul className="updates-center-list batch-update-confirm-list">
            {visibleItems.map(({ repo, currentVersion, latestVersion }) => (
              <li key={`${repo.owner.login}/${repo.name}`} className="updates-center-row">
                <div>
                  <strong>{repo.name}</strong>
                  <span>{currentVersion} {'->'} {latestVersion}</span>
                </div>
              </li>
            ))}
          </ul>

          {items.length > visibleItems.length && (
            <p className="updates-center-empty">
              {t('updates.confirmMore', { count: items.length - visibleItems.length })}
            </p>
          )}
          <p className="updates-center-empty">{t('updates.confirmPortableOnly')}</p>

          <div className="modal-actions">
            <button type="button" className="secondary-btn" onClick={onCancel} data-autofocus="true">
              {t('updates.confirmCancel')}
            </button>
            <button type="button" className="hero-primary-btn" onClick={onConfirm}>
              {t('updates.confirmStart')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function BatchUpdatePanel({
  items,
  skippedCount,
  lastChecked,
  checking,
  updating,
  versionErrorCount,
  updateMessage,
  cleanupMessage,
  error,
  children,
  onCheck,
  onUpdateAll,
  onClearSkipped,
  onUpdate,
  onShowDetails,
  onSkip,
}: BatchUpdatePanelProps) {
  const { t } = useI18n()
  const [confirmingUpdateAll, setConfirmingUpdateAll] = useState(false)
  const emptyKey = checking
    ? 'updates.emptyChecking'
    : versionErrorCount > 0
      ? 'updates.emptyPartial'
      : lastChecked
        ? 'updates.emptyCurrent'
        : 'updates.emptyNotChecked'

  return (
    <>
      <section className="updates-center" aria-label={t('updates.centerTitle')}>
      <div className="updates-center-main">
        <div>
          <span className="updates-center-kicker">{t('updates.kicker')}</span>
          <h3>{t('updates.centerTitle')}</h3>
          <p>{t('updates.centerText')}</p>
        </div>
        <div className="updates-center-actions">
          <button type="button" className="secondary-btn" onClick={onCheck} disabled={checking || updating}>
            {checking ? t('library.refreshing') : t('updates.checkAll')}
          </button>
          <button
            type="button"
            className="hero-primary-btn"
            aria-haspopup="dialog"
            onClick={() => setConfirmingUpdateAll(true)}
            disabled={items.length === 0 || checking || updating}
          >
            {updating ? t('updates.updatingAll') : t('updates.updateAllPortable')}
          </button>
        </div>
      </div>

      <div className="updates-center-stats">
        <div>
          <span>{t('updates.available')}</span>
          <strong>{items.length}</strong>
        </div>
        <div>
          <span>{t('updates.skipped')}</span>
          <strong>{skippedCount}</strong>
        </div>
        <div>
          <span>{t('updates.lastChecked')}</span>
          <strong>{lastChecked ?? t('details.unknown')}</strong>
        </div>
      </div>

      {skippedCount > 0 && (
        <button type="button" className="updates-clear-skipped" onClick={onClearSkipped}>
          {t('updates.showSkipped')}
        </button>
      )}

      {updateMessage && <div className="release-cleanup-note">{updateMessage}</div>}
      {cleanupMessage && <div className="release-cleanup-note">{cleanupMessage}</div>}
      {error && <div className="error-message">{error}</div>}

      {items.length > 0 ? (
        <div className="updates-center-list">
          {items.slice(0, 6).map(({ repo, currentVersion, latestVersion }) => (
            <div key={`${repo.owner.login}/${repo.name}`} className="updates-center-row">
              <div>
                <strong>{repo.name}</strong>
                <span>{currentVersion} {'->'} {latestVersion}</span>
              </div>
              <div className="updates-center-row-actions">
                <button type="button" className="secondary-btn" onClick={() => onUpdate(repo)}>{t('repo.updateAction')}</button>
                <button type="button" className="secondary-btn" onClick={() => onShowDetails(repo)}>{t('details.open')}</button>
                <button type="button" className="secondary-btn" onClick={() => onSkip(repo)}>{t('updates.skip')}</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="updates-center-empty">{t(emptyKey, { count: versionErrorCount })}</p>
      )}

        {children}
      </section>

      {confirmingUpdateAll && (
        <BatchUpdateConfirmDialog
          items={items}
          onCancel={() => setConfirmingUpdateAll(false)}
          onConfirm={() => {
            setConfirmingUpdateAll(false)
            onUpdateAll()
          }}
        />
      )}
    </>
  )
}
