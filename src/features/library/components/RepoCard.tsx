import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { GitHubSearchResult, InstalledApp, ProjectArt } from '../../../types'
import { addToFavorites, checkIsFavorite, removeFromFavorites } from '../../../services/favorites'
import { projectArtCoverCropStyle, projectArtCoverUrl } from '../../../services/projectArt'
import { useI18n } from '../../../i18n'
import { formatDate, formatNumber } from '../../../utils/format'
import { getLibraryAppStatus } from '../libraryStatus'
import { focusFirstMenuItem, handleMenuKeyboard } from '../../../utils/menuKeyboard'
import { ChevronRightIcon } from '../../../components/ui/Icons'
import './SearchComponents.css'

const REPO_MENU_OPEN_EVENT = 'pullora:repo-menu-open'
type RepoSubmenu = 'add-folder' | 'remove-folder' | 'cover' | 'background'

interface RepoCardProps {
  repo: GitHubSearchResult
  installedApp?: InstalledApp
  latestVersion?: string
  art?: ProjectArt
  folders?: Array<{ id: string; name: string }>
  removableFolders?: Array<{ id: string; name: string }>
  isFavorite?: boolean
  isSelected?: boolean
  isBulkSelected?: boolean
  onBulkSelect?: (range: boolean) => void
  onPreview?: () => void
  onFavoriteChange?: (isFavorite: boolean) => void
  onCreateFolder?: () => void
  onMoveToFolder?: (folderId: string) => void
  onRemoveFromFolder?: (folderId: string) => void
  onMoveToUncategorized?: () => void
  onPickArt?: () => void
  onEditArt?: () => void
  onPickBackground?: () => void
  onEditBackground?: () => void
  onClearArt?: () => void
  onClearBackground?: () => void
  onUninstall?: () => void
  onOpenFolder?: () => void
  onShowVersions?: () => void
  onInstall?: () => void
  onLaunch?: () => void
}

function RepoCard({
  repo,
  installedApp,
  latestVersion,
  art,
  folders = [],
  removableFolders = [],
  isFavorite,
  isSelected = false,
  isBulkSelected = false,
  onBulkSelect,
  onPreview,
  onFavoriteChange,
  onCreateFolder,
  onMoveToFolder,
  onRemoveFromFolder,
  onMoveToUncategorized,
  onPickArt,
  onEditArt,
  onPickBackground,
  onEditBackground,
  onClearArt,
  onClearBackground,
  onUninstall,
  onOpenFolder,
  onShowVersions,
  onInstall,
  onLaunch,
}: RepoCardProps) {
  const { language, t } = useI18n()
  const [isFav, setIsFav] = useState(false)
  const [favLoading, setFavLoading] = useState(false)
  const [actionsOpen, setActionsOpen] = useState(false)
  const [submenuOpen, setSubmenuOpen] = useState<RepoSubmenu | null>(null)
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | null>(null)
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null)
  const [submenuPosition, setSubmenuPosition] = useState<{ x: number; y: number } | null>(null)
  const cardRef = useRef<HTMLElement | null>(null)
  const actionsRef = useRef<HTMLDivElement | null>(null)
  const submenuTriggerRef = useRef<HTMLButtonElement | null>(null)
  const submenuRef = useRef<HTMLDivElement | null>(null)
  const menuId = useId()
  const submenuTriggerId = (kind: RepoSubmenu) => `${menuId}-${kind}-trigger`
  const submenuPanelId = (kind: RepoSubmenu) => `${menuId}-${kind}-menu`
  const closeActions = (restoreFocus = true) => {
    setActionsOpen(false)
    if (restoreFocus) cardRef.current?.focus()
  }
  const status = getLibraryAppStatus(installedApp, latestVersion)
  const isInstalled = status !== 'available'
  const hasUpdate = status === 'update'

  useEffect(() => {
    if (typeof isFavorite === 'boolean') {
      setIsFav(isFavorite)
      return
    }

    checkIsFavorite(repo.owner.login, repo.name)
      .then(setIsFav)
      .catch(() => {})
  }, [isFavorite, repo.owner.login, repo.name])

  useEffect(() => {
    if (!actionsOpen) {
      setSubmenuOpen(null)
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (
        !actionsRef.current?.contains(target)
        && !submenuRef.current?.contains(target)
      ) {
        closeActions()
      }
    }

    const closeAndRestoreFocus = () => closeActions()
    const closeOtherMenu = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== menuId) closeActions(false)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeAndRestoreFocus()
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener(REPO_MENU_OPEN_EVENT, closeOtherMenu)
    window.addEventListener('resize', closeAndRestoreFocus)
    window.addEventListener('scroll', closeAndRestoreFocus, true)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener(REPO_MENU_OPEN_EVENT, closeOtherMenu)
      window.removeEventListener('resize', closeAndRestoreFocus)
      window.removeEventListener('scroll', closeAndRestoreFocus, true)
    }
  }, [actionsOpen])

  useEffect(() => {
    if (actionsOpen && menuPosition) {
      focusFirstMenuItem(actionsRef.current?.querySelector<HTMLElement>('[role="menu"]') ?? null)
    }
  }, [actionsOpen, menuPosition])

  useEffect(() => {
    if (!actionsOpen || !menuAnchor || !actionsRef.current) return

    const edge = 8
    const bounds = actionsRef.current.getBoundingClientRect()
    const preferredX = menuAnchor.x + bounds.width + edge > window.innerWidth
      ? menuAnchor.x - bounds.width
      : menuAnchor.x
    const preferredY = menuAnchor.y + bounds.height + edge > window.innerHeight
      ? menuAnchor.y - bounds.height
      : menuAnchor.y

    setMenuPosition({
      x: Math.max(edge, Math.min(preferredX, window.innerWidth - bounds.width - edge)),
      y: Math.max(edge, Math.min(preferredY, window.innerHeight - bounds.height - edge)),
    })
  }, [actionsOpen, menuAnchor])

  useEffect(() => {
    const trigger = submenuTriggerRef.current
    const menu = submenuRef.current
    if (!trigger || !menu) return

    const edge = 8
    const gap = 6
    const triggerBounds = trigger.getBoundingClientRect()
    const menuBounds = menu.getBoundingClientRect()
    const rootBounds = actionsRef.current?.getBoundingClientRect() ?? triggerBounds
    const openLeft = rootBounds.right + gap + menuBounds.width + edge > window.innerWidth
    const x = openLeft
      ? rootBounds.left - menuBounds.width - gap
      : rootBounds.right + gap

    setSubmenuPosition({
      x: Math.max(edge, Math.min(x, window.innerWidth - menuBounds.width - edge)),
      y: Math.max(edge, Math.min(triggerBounds.top, window.innerHeight - menuBounds.height - edge)),
    })
  }, [submenuOpen])

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    handleMenuKeyboard(
      event,
      closeActions,
      actionsRef.current?.querySelector<HTMLElement>('[role="menu"]') ?? event.currentTarget,
    )
  }

  const toggleFavorite = async (event: React.MouseEvent) => {
    event.stopPropagation()
    closeActions()
    setFavLoading(true)
    try {
      if (isFav) {
        await removeFromFavorites(repo.owner.login, repo.name)
        setIsFav(false)
        onFavoriteChange?.(false)
      } else {
        await addToFavorites(
          repo.owner.login,
          repo.name,
          repo.name,
          repo.description ?? undefined,
        )
        setIsFav(true)
        onFavoriteChange?.(true)
      }
    } catch {
      // Browser preview fallback.
    } finally {
      setFavLoading(false)
    }
  }

  const handleLaunch = (event: React.MouseEvent) => {
    event.stopPropagation()
    closeActions()
    onLaunch?.()
  }

  const handleInstall = (event: React.MouseEvent) => {
    event.stopPropagation()
    closeActions()
    onInstall?.()
  }

  const handlePickArt = (event: React.MouseEvent) => {
    event.stopPropagation()
    closeActions()
    onPickArt?.()
  }

  const handlePickBackground = (event: React.MouseEvent) => {
    event.stopPropagation()
    closeActions()
    onPickBackground?.()
  }

  const handleClearArt = (event: React.MouseEvent) => {
    event.stopPropagation()
    closeActions()
    onClearArt?.()
  }

  const handleClearBackground = (event: React.MouseEvent) => {
    event.stopPropagation()
    closeActions()
    onClearBackground?.()
  }

  const handleRemoveFromFolder = (event: React.MouseEvent, folderId: string) => {
    event.stopPropagation()
    closeActions()
    onRemoveFromFolder?.(folderId)
  }

  const handleUninstall = (event: React.MouseEvent) => {
    event.stopPropagation()
    closeActions()
    onUninstall?.()
  }

  const handleOpenFolder = (event: React.MouseEvent) => {
    event.stopPropagation()
    closeActions()
    onOpenFolder?.()
  }

  const handleShowVersions = (event: React.MouseEvent) => {
    event.stopPropagation()
    closeActions()
    onShowVersions?.()
  }

  const handleMoveToFolder = (event: React.MouseEvent, folderId: string) => {
    event.stopPropagation()
    closeActions()
    onMoveToFolder?.(folderId)
  }

  const handleMoveToUncategorized = (event: React.MouseEvent) => {
    event.stopPropagation()
    closeActions()
    onMoveToUncategorized?.()
  }

  const handleCreateFolder = (event: React.MouseEvent) => {
    event.stopPropagation()
    closeActions()
    onCreateFolder?.()
  }

  const handleEditBackground = (event: React.MouseEvent) => {
    event.stopPropagation()
    closeActions()
    onEditBackground?.()
  }

  const handleEditArt = (event: React.MouseEvent) => {
    event.stopPropagation()
    closeActions()
    onEditArt?.()
  }

  const openActions = (anchor: { x: number; y: number }) => {
    window.dispatchEvent(new CustomEvent(REPO_MENU_OPEN_EVENT, { detail: menuId }))
    setSubmenuOpen(null)
    setSubmenuPosition(null)
    setMenuPosition(null)
    setMenuAnchor(anchor)
    setActionsOpen(true)
  }

  const handleContextMenu = (event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    openActions({ x: event.clientX, y: event.clientY })
  }

  const handlePreview = () => {
    onPreview?.()
  }

  const handleCardClick = (event: React.MouseEvent<HTMLElement>) => {
    if (onBulkSelect && (event.ctrlKey || event.metaKey || event.shiftKey)) {
      event.preventDefault()
      onBulkSelect(event.shiftKey)
      return
    }
    handlePreview()
  }

  const updatedDate = formatDate(repo.updated_at, language)
  const statusLabel = t(`repo.${status}`)
  const primaryLabel = hasUpdate ? t('repo.updateAction') : isInstalled ? t('repo.launch') : t('repo.install')
  const primaryAction = isInstalled && !hasUpdate ? handleLaunch : handleInstall
  const hasPersonalizationActions = Boolean(
    onPickArt || onEditArt || onPickBackground || onEditBackground || (art?.coverPath && onClearArt) || (art?.backgroundPath && onClearBackground),
  )

  const openSubmenu = (kind: RepoSubmenu) => {
    setSubmenuPosition(null)
    setSubmenuOpen(kind)
  }

  const renderSubmenuTrigger = (kind: RepoSubmenu, label: string) => (
    <div
      className={`repo-actions-submenu ${submenuOpen === kind ? 'open' : ''}`}
      onMouseEnter={() => openSubmenu(kind)}
    >
      <button
        ref={submenuOpen === kind ? submenuTriggerRef : undefined}
        id={submenuTriggerId(kind)}
        type="button"
        role="menuitem"
        className="repo-actions-submenu-trigger"
        aria-haspopup="menu"
        aria-expanded={submenuOpen === kind}
        aria-controls={submenuPanelId(kind)}
        onClick={(event) => {
          event.stopPropagation()
          if (submenuOpen === kind) setSubmenuOpen(null)
          else openSubmenu(kind)
        }}
      >
        <span>{label}</span>
        <ChevronRightIcon className="menu-chevron-icon" />
      </button>
    </div>
  )

  const coverUrl = projectArtCoverUrl(art)

  return (
    <article
      ref={cardRef}
      className={`repo-card repo-card--${status} ${isSelected ? 'selected' : ''} ${isBulkSelected ? 'bulk-selected' : ''}`}
      onClick={handleCardClick}
      onContextMenu={handleContextMenu}
      tabIndex={0}
      role="button"
      aria-label={`${repo.name}, ${statusLabel}${onBulkSelect ? `. ${t('library.bulk.cardHint')}` : ''}`}
      aria-current={isSelected ? 'true' : undefined}
      aria-pressed={onBulkSelect ? isBulkSelected : undefined}
      aria-keyshortcuts={onBulkSelect ? 'Control+Space Meta+Space Shift+Space' : undefined}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return

        if (event.key === ' ' && onBulkSelect && (event.ctrlKey || event.metaKey || event.shiftKey)) {
          event.preventDefault()
          onBulkSelect(event.shiftKey)
          return
        }

        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          handlePreview()
          return
        }

        if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
          event.preventDefault()
          const bounds = event.currentTarget.getBoundingClientRect()
          openActions({ x: bounds.left + 24, y: bounds.top + 24 })
        }
      }}
    >
      {isBulkSelected && (
        <span className="repo-bulk-selection-mark" aria-hidden="true">✓</span>
      )}
      <div className="repo-card-media">
        <div className="owner-avatar">
          <img
            src={coverUrl ?? repo.owner.avatar_url}
            alt=""
            className={coverUrl ? 'project-art-cover' : undefined}
            style={coverUrl ? projectArtCoverCropStyle(art) : undefined}
          />
        </div>
      </div>

      <div className="repo-info">
        <div className="repo-title-line">
          <h3 className="repo-name" title={repo.name}>{repo.name}</h3>
          <span className={`repo-status ${status}`}>
            {statusLabel}
          </span>
        </div>

        <div className="repo-owner">{repo.owner.login}/{repo.name}</div>

        {repo.description && (
          <p className="repo-description">{repo.description}</p>
        )}

        <div className="repo-meta">
          <span>{t('repo.stars', { count: formatNumber(repo.stargazers_count, language) })}</span>
          {repo.language && (
            <span className="repo-lang">{repo.language}</span>
          )}
          {installedApp && (
            <span className="repo-installed-version">
              {t('repo.active', { version: installedApp.activeVersion })}
            </span>
          )}
          {hasUpdate && latestVersion && (
            <span className="repo-update-version">
              {t('repo.new', { version: latestVersion })}
            </span>
          )}
          <span>{t('repo.updated', { date: updatedDate })}</span>
        </div>
      </div>

      {actionsOpen && menuAnchor && createPortal(
        <>
          <div
            className="project-actions-menu repo-actions-menu repo-context-menu open"
            ref={actionsRef}
            style={{
              left: menuPosition?.x ?? menuAnchor.x,
              top: menuPosition?.y ?? menuAnchor.y,
              visibility: menuPosition ? 'visible' : 'hidden',
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div
              className="project-actions-popover"
              role="menu"
              aria-label={t(isInstalled ? 'installed.moreActions' : 'art.actions')}
              onKeyDown={handleMenuKeyDown}
            >
              <button
                type="button"
                role="menuitem"
                onClick={primaryAction}
              >
                {primaryLabel}
              </button>
            {isInstalled && hasUpdate && (
              <button type="button" role="menuitem" onClick={handleLaunch}>
                {t('repo.launch')}
              </button>
            )}
            {isInstalled && onOpenFolder && (
              <button type="button" role="menuitem" onClick={handleOpenFolder}>
                {t('download.openFolder')}
              </button>
            )}
            {isInstalled && onShowVersions && (
              <button type="button" role="menuitem" onClick={handleShowVersions}>
                {t('repo.versions')}
              </button>
            )}
            <div className="repo-actions-menu-separator" role="separator" />
            <button
              type="button"
              role="menuitem"
              onClick={toggleFavorite}
              disabled={favLoading}
            >
              {isFav ? t('repo.removeFavorite') : t('repo.addFavorite')}
            </button>
            {(onCreateFolder || onMoveToFolder || onMoveToUncategorized) && (
              renderSubmenuTrigger('add-folder', t('library.folder.addTo'))
            )}
            {onRemoveFromFolder && removableFolders.length > 0 && (
              renderSubmenuTrigger('remove-folder', t('library.folder.removeFrom'))
            )}
            {hasPersonalizationActions && (
              <div className="repo-actions-menu-separator" role="separator" />
            )}
            {(onPickArt || onEditArt || (art?.coverPath && onClearArt))
              && renderSubmenuTrigger('cover', t('art.cover'))}
            {(onPickBackground || onEditBackground || (art?.backgroundPath && onClearBackground))
              && renderSubmenuTrigger('background', t('art.background'))}
            {isInstalled && onUninstall && (
              <>
                <div className="repo-actions-menu-separator" role="separator" />
                <button
                  type="button"
                  role="menuitem"
                  className="danger-menu-item"
                  onClick={handleUninstall}
                >
                  {t('installed.uninstallApp')}
                </button>
              </>
            )}
            </div>
          </div>
          {submenuOpen && (
            <div
              ref={submenuRef}
              id={submenuPanelId(submenuOpen)}
              className="repo-actions-submenu-panel"
              role="menu"
              aria-labelledby={submenuTriggerId(submenuOpen)}
              style={{
                left: submenuPosition?.x ?? 0,
                top: submenuPosition?.y ?? 0,
                visibility: submenuPosition ? 'visible' : 'hidden',
              }}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={handleMenuKeyDown}
            >
              {submenuOpen === 'add-folder' && onCreateFolder && (
                <button type="button" role="menuitem" onClick={handleCreateFolder}>
                  {t('library.folder.createNew')}
                </button>
              )}
              {submenuOpen === 'add-folder' && onMoveToUncategorized && (
                <button type="button" role="menuitem" onClick={handleMoveToUncategorized}>
                  {t('library.folder.uncategorized')}
                </button>
              )}
              {submenuOpen === 'add-folder' && folders.length > 0 && (
                <span className="repo-actions-menu-label">{t('library.folder.title')}</span>
              )}
              {submenuOpen === 'add-folder' && folders.map((folder) => (
                <button
                  key={folder.id}
                  type="button"
                  role="menuitem"
                  onClick={(event) => handleMoveToFolder(event, folder.id)}
                >
                  {folder.name}
                </button>
              ))}
              {submenuOpen === 'remove-folder' && removableFolders.map((folder) => (
                <button
                  key={folder.id}
                  type="button"
                  role="menuitem"
                  onClick={(event) => handleRemoveFromFolder(event, folder.id)}
                >
                  {folder.name}
                </button>
              ))}
              {submenuOpen === 'cover' && art?.coverPath && onEditArt && (
                <button type="button" role="menuitem" onClick={handleEditArt}>{t('art.edit')}</button>
              )}
              {submenuOpen === 'cover' && onPickArt && (
                <button type="button" role="menuitem" onClick={handlePickArt}>
                  {t(art?.coverPath ? 'art.replace' : 'art.changeCover')}
                </button>
              )}
              {submenuOpen === 'cover' && art?.coverPath && onClearArt && (
                <button type="button" role="menuitem" onClick={handleClearArt}>{t('art.reset')}</button>
              )}
              {submenuOpen === 'background' && art?.backgroundPath && onEditBackground && (
                <button type="button" role="menuitem" onClick={handleEditBackground}>{t('art.edit')}</button>
              )}
              {submenuOpen === 'background' && onPickBackground && (
                <button type="button" role="menuitem" onClick={handlePickBackground}>
                  {t(art?.backgroundPath ? 'art.replace' : 'art.changeBackground')}
                </button>
              )}
              {submenuOpen === 'background' && art?.backgroundPath && onClearBackground && (
                <button type="button" role="menuitem" onClick={handleClearBackground}>{t('art.reset')}</button>
              )}
            </div>
          )}
        </>,
        document.getElementById('app-overlay-root') ?? document.body,
      )}
    </article>
  )
}

export default RepoCard
