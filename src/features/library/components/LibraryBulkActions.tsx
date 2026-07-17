import { useRef } from 'react'
import { useI18n } from '../../../i18n'
import { useModalFocus } from '../../../hooks/useModalFocus'
import { formatBytes } from '../../../utils/format'

interface LibraryBulkActionsProps {
  selectedCount: number
  visibleCount: number
  updateCount: number
  installedCount: number
  cleanupVersionCount: number
  busy: boolean
  folders: Array<{ id: string; name: string }>
  message?: string | null
  error?: string | null
  onSelectAll: () => void
  onClear: () => void
  onUpdate: () => void
  onMoveToFolder: (folderId: string | null) => void
  onAddFavorite: () => void
  onRemoveFavorite: () => void
  onRequestCleanup: () => void
  onRequestUninstall: () => void
}

export function LibraryBulkActions({
  selectedCount,
  visibleCount,
  updateCount,
  installedCount,
  cleanupVersionCount,
  busy,
  folders,
  message,
  error,
  onSelectAll,
  onClear,
  onUpdate,
  onMoveToFolder,
  onAddFavorite,
  onRemoveFavorite,
  onRequestCleanup,
  onRequestUninstall,
}: LibraryBulkActionsProps) {
  const { t } = useI18n()
  if (selectedCount === 0) return null

  return (
    <section className="library-bulk-actions" aria-label={t('library.bulk.actions')} aria-busy={busy}>
      <div className="library-bulk-summary">
        <strong>{t('library.bulk.selected', { count: selectedCount })}</strong>
        <span>
          <button type="button" onClick={onSelectAll} disabled={busy || selectedCount === visibleCount}>
            {t('library.bulk.selectVisible')}
          </button>
          <button type="button" onClick={onClear} disabled={busy}>{t('library.bulk.clear')}</button>
        </span>
      </div>

      <div className="library-bulk-toolbar">
        <button
          type="button"
          onClick={onUpdate}
          disabled={busy || updateCount === 0}
          title={updateCount === 0 ? t('library.bulk.noUpdates') : undefined}
        >
          {t('library.bulk.update', { count: updateCount })}
        </button>

        <details className="library-bulk-menu">
          <summary>{t('library.bulk.folder')}</summary>
          <div className="library-bulk-menu-popover">
            <button type="button" onClick={() => onMoveToFolder(null)} disabled={busy}>
              {t('library.folder.uncategorized')}
            </button>
            {folders.map((folder) => (
              <button key={folder.id} type="button" onClick={() => onMoveToFolder(folder.id)} disabled={busy}>
                {folder.name}
              </button>
            ))}
          </div>
        </details>

        <details className="library-bulk-menu">
          <summary>{t('library.bulk.favorite')}</summary>
          <div className="library-bulk-menu-popover">
            <button type="button" onClick={onAddFavorite} disabled={busy}>{t('library.bulk.favoriteAdd')}</button>
            <button type="button" onClick={onRemoveFavorite} disabled={busy}>{t('library.bulk.favoriteRemove')}</button>
          </div>
        </details>

        <details className="library-bulk-menu library-bulk-menu--more">
          <summary aria-label={t('library.bulk.more')}>•••</summary>
          <div className="library-bulk-menu-popover">
            <button
              type="button"
              onClick={onRequestCleanup}
              disabled={busy || cleanupVersionCount === 0}
              title={cleanupVersionCount === 0 ? t('library.bulk.noInactiveVersions') : undefined}
            >
              {t('library.bulk.cleanup', { count: cleanupVersionCount })}
            </button>
            <button
              type="button"
              className="danger-menu-item"
              onClick={onRequestUninstall}
              disabled={busy || installedCount === 0}
              title={installedCount === 0 ? t('library.bulk.noInstalled') : undefined}
            >
              {t('library.bulk.uninstall', { count: installedCount })}
            </button>
          </div>
        </details>
      </div>

      {message && <p className="library-bulk-message" role="status" aria-live="polite">{message}</p>}
      {error && <p className="library-bulk-error" role="alert">{error}</p>}
    </section>
  )
}

interface LibraryBulkConfirmDialogProps {
  action: 'cleanup' | 'uninstall'
  appCount: number
  versionCount: number
  sizeBytes: number
  busy: boolean
  error?: string | null
  onCancel: () => void
  onConfirm: () => void
}

export function LibraryBulkConfirmDialog({
  action,
  appCount,
  versionCount,
  sizeBytes,
  busy,
  error,
  onCancel,
  onConfirm,
}: LibraryBulkConfirmDialogProps) {
  const { language, t } = useI18n()
  const modalRef = useRef<HTMLDivElement | null>(null)
  useModalFocus(modalRef, { onEscape: busy ? undefined : onCancel })

  return (
    <div className="modal-overlay uninstall-overlay" onClick={() => !busy && onCancel()}>
      <div
        ref={modalRef}
        className="modal-content uninstall-confirm-modal library-bulk-confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="library-bulk-confirm-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="uninstall-confirm-header">
          <div>
            <span className="uninstall-confirm-kicker">{t('library.bulk.confirmKicker')}</span>
            <h2 id="library-bulk-confirm-title">{t(`library.bulk.${action}Title`)}</h2>
          </div>
          <button type="button" className="close-btn" aria-label={t('release.close')} disabled={busy} onClick={onCancel}>×</button>
        </header>
        <div className="uninstall-confirm-body">
          <p className="uninstall-confirm-copy">{t(`library.bulk.${action}Copy`)}</p>
          <div className="uninstall-confirm-facts">
            <div><span>{t('library.bulk.apps')}</span><strong>{appCount}</strong></div>
            <div><span>{t('library.bulk.versions')}</span><strong>{versionCount}</strong></div>
            <div><span>{t('library.bulk.size')}</span><strong>{formatBytes(sizeBytes, language)}</strong></div>
          </div>
          {error && <div className="error-message" role="alert">{error}</div>}
          <div className="uninstall-confirm-actions">
            <button type="button" className="secondary-btn" onClick={onCancel} disabled={busy}>{t('installed.uninstallCancel')}</button>
            <button type="button" className="uninstall-danger-btn" onClick={onConfirm} disabled={busy} data-autofocus="true">
              {busy ? t('library.bulk.running') : t(`library.bulk.${action}Confirm`)}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
