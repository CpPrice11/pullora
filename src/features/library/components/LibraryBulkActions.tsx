import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '../../../i18n'
import { useModalFocus } from '../../../hooks/useModalFocus'
import { formatBytes } from '../../../utils/format'
import { focusFirstMenuItem, handleMenuKeyboard } from '../../../utils/menuKeyboard'
import { CloseIcon, MoreHorizontalIcon } from '../../../components/ui/Icons'

interface BulkActionMenuProps {
  label: ReactNode
  ariaLabel: string
  className?: string
  children: ReactNode
}

function BulkActionMenu({ label, ariaLabel, className = '', children }: BulkActionMenuProps) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{ x: number; y: number; openUp: boolean } | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return

    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) {
        setOpen(false)
      }
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    const closeOnViewportChange = () => setOpen(false)

    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    document.addEventListener('scroll', closeOnViewportChange, true)
    window.addEventListener('resize', closeOnViewportChange)
    focusFirstMenuItem(menuRef.current)
    if (!menuRef.current?.contains(document.activeElement)) menuRef.current?.focus()

    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
      document.removeEventListener('scroll', closeOnViewportChange, true)
      window.removeEventListener('resize', closeOnViewportChange)
    }
  }, [open])

  const toggleMenu = () => {
    if (open) {
      setOpen(false)
      return
    }

    const bounds = triggerRef.current?.getBoundingClientRect()
    if (!bounds) return
    setPosition({
      x: Math.max(8, Math.min(bounds.left, window.innerWidth - 228)),
      y: bounds.top - 6,
      openUp: bounds.top > 220,
    })
    setOpen(true)
  }

  return (
    <div className={`library-bulk-menu ${className}`.trim()}>
      <button
        ref={triggerRef}
        type="button"
        className="library-bulk-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={ariaLabel}
        onClick={toggleMenu}
      >
        {label}
      </button>
      {open && position && typeof document !== 'undefined' && createPortal(
        <div
          className="library-bulk-menu-portal"
          style={{
            left: position.x,
            top: position.openUp ? position.y : position.y + 42,
            transform: position.openUp ? 'translateY(-100%)' : undefined,
          }}
        >
          <div
            ref={menuRef}
            id={menuId}
            className="library-bulk-menu-popover"
            role="menu"
            tabIndex={-1}
            aria-label={ariaLabel}
            onClick={(event) => {
              if ((event.target as HTMLElement).closest('button')) {
                setOpen(false)
                triggerRef.current?.focus()
              }
            }}
            onKeyDown={(event) => handleMenuKeyboard(event, () => {
              setOpen(false)
              triggerRef.current?.focus()
            })}
          >
            {children}
          </div>
        </div>,
        document.querySelector('.layout') ?? document.body,
      )}
    </div>
  )
}

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

        <BulkActionMenu label={t('library.bulk.folder')} ariaLabel={t('library.bulk.folder')}>
          <button type="button" role="menuitem" onClick={() => onMoveToFolder(null)} disabled={busy}>
            {t('library.folder.uncategorized')}
          </button>
          {folders.map((folder) => (
            <button key={folder.id} type="button" role="menuitem" onClick={() => onMoveToFolder(folder.id)} disabled={busy}>
              {folder.name}
            </button>
          ))}
        </BulkActionMenu>

        <BulkActionMenu label={t('library.bulk.favorite')} ariaLabel={t('library.bulk.favorite')}>
          <button type="button" role="menuitem" onClick={onAddFavorite} disabled={busy}>{t('library.bulk.favoriteAdd')}</button>
          <button type="button" role="menuitem" onClick={onRemoveFavorite} disabled={busy}>{t('library.bulk.favoriteRemove')}</button>
        </BulkActionMenu>

        <BulkActionMenu
          className="library-bulk-menu--more"
          label={<MoreHorizontalIcon className="menu-overflow-icon" />}
          ariaLabel={t('library.bulk.more')}
        >
          <button
            type="button"
            role="menuitem"
            onClick={onRequestCleanup}
            disabled={busy || cleanupVersionCount === 0}
            title={cleanupVersionCount === 0 ? t('library.bulk.noInactiveVersions') : undefined}
          >
            {t('library.bulk.cleanup', { count: cleanupVersionCount })}
          </button>
          <button
            type="button"
            role="menuitem"
            className="danger-menu-item"
            onClick={onRequestUninstall}
            disabled={busy || installedCount === 0}
            title={installedCount === 0 ? t('library.bulk.noInstalled') : undefined}
          >
            {t('library.bulk.uninstall', { count: installedCount })}
          </button>
        </BulkActionMenu>
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
  const titleId = useId()
  const descriptionId = useId()
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
        className={`modal-content uninstall-confirm-modal library-bulk-confirm library-bulk-confirm--${action}`}
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
            <span className="uninstall-confirm-kicker">{t('library.bulk.confirmKicker')}</span>
            <h2 id={titleId}>{t(`library.bulk.${action}Title`)}</h2>
          </div>
          <button type="button" className="close-btn" aria-label={t('release.close')} disabled={busy} onClick={onCancel}>
            <CloseIcon className="dialog-close-icon" />
          </button>
        </header>
        <div className="uninstall-confirm-body">
          <p id={descriptionId} className="uninstall-confirm-copy">{t(`library.bulk.${action}Copy`)}</p>
          <div className="uninstall-confirm-facts">
            <div><span>{t('library.bulk.apps')}</span><strong>{appCount}</strong></div>
            <div><span>{t('library.bulk.versions')}</span><strong>{versionCount}</strong></div>
            <div><span>{t('library.bulk.size')}</span><strong>{formatBytes(sizeBytes, language)}</strong></div>
          </div>
          {error && <div className="error-message" role="alert">{error}</div>}
          <span className="visually-hidden" role="status" aria-live="polite">
            {busy ? t('library.bulk.running') : ''}
          </span>
          <div className="uninstall-confirm-actions">
            <button type="button" className="secondary-btn" onClick={onCancel} disabled={busy} data-autofocus="true">
              {t('installed.uninstallCancel')}
            </button>
            <button type="button" className="uninstall-danger-btn" onClick={onConfirm} disabled={busy}>
              {busy ? t('library.bulk.running') : t(`library.bulk.${action}Confirm`)}
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
