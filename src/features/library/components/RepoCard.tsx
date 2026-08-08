import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { GitHubSearchResult, InstalledApp, ProjectArt } from '../../../types'
import { addToFavorites, checkIsFavorite, removeFromFavorites } from '../../../services/favorites'
import { projectArtCoverUrl } from '../../../services/projectArt'
import { useI18n } from '../../../i18n'
import { formatDate, formatNumber } from '../../../utils/format'
import { getLibraryAppStatus } from '../libraryStatus'
import { focusFirstMenuItem, handleMenuKeyboard } from '../../../utils/menuKeyboard'
import { ChevronRightIcon } from '../../../components/ui/Icons'
import './SearchComponents.css'

const REPO_MENU_OPEN_EVENT = 'pullora:repo-menu-open'

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
  onPickBackground?: () => void
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
  onPickBackground,
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
  const [folderMenuOpen, setFolderMenuOpen] = useState(false)
  const [removeFolderMenuOpen, setRemoveFolderMenuOpen] = useState(false)
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | null>(null)
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null)
  const [folderMenuPosition, setFolderMenuPosition] = useState<{ x: number; y: number } | null>(null)
  const [removeFolderMenuPosition, setRemoveFolderMenuPosition] = useState<{ x: number; y: number } | null>(null)
  const cardRef = useRef<HTMLElement | null>(null)
  const actionsRef = useRef<HTMLDivElement | null>(null)
  const folderTriggerRef = useRef<HTMLButtonElement | null>(null)
  const folderMenuRef = useRef<HTMLDivElement | null>(null)
  const removeFolderTriggerRef = useRef<HTMLButtonElement | null>(null)
  const removeFolderMenuRef = useRef<HTMLDivElement | null>(null)
  const menuId = useId()
  const folderTriggerId = `${menuId}-folder-trigger`
  const folderMenuId = `${menuId}-folder-menu`
  const removeFolderTriggerId = `${menuId}-remove-folder-trigger`
  const removeFolderMenuId = `${menuId}-remove-folder-menu`
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
      setFolderMenuOpen(false)
      setRemoveFolderMenuOpen(false)
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (
        !actionsRef.current?.contains(target)
        && !folderMenuRef.current?.contains(target)
        && !removeFolderMenuRef.current?.contains(target)
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
    const trigger = folderMenuOpen ? folderTriggerRef.current : removeFolderTriggerRef.current
    const menu = folderMenuOpen ? folderMenuRef.current : removeFolderMenuRef.current
    const setPosition = folderMenuOpen ? setFolderMenuPosition : setRemoveFolderMenuPosition
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

    setPosition({
      x: Math.max(edge, Math.min(x, window.innerWidth - menuBounds.width - edge)),
      y: Math.max(edge, Math.min(triggerBounds.top, window.innerHeight - menuBounds.height - edge)),
    })
  }, [folderMenuOpen, removeFolderMenuOpen])

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

  const openActions = (anchor: { x: number; y: number }) => {
    window.dispatchEvent(new CustomEvent(REPO_MENU_OPEN_EVENT, { detail: menuId }))
    setFolderMenuOpen(false)
    setRemoveFolderMenuOpen(false)
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
    onPickArt || onPickBackground || (art?.coverPath && onClearArt) || (art?.backgroundPath && onClearBackground),
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
        <img
          src={coverUrl ?? repo.owner.avatar_url}
          alt=""
          className="owner-avatar"
        />
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
              <div
                className={`repo-actions-submenu ${folderMenuOpen ? 'open' : ''}`}
                onMouseEnter={() => {
                  setFolderMenuPosition(null)
                  setFolderMenuOpen(true)
                  setRemoveFolderMenuOpen(false)
                }}
              >
                <button
                  ref={folderTriggerRef}
                  id={folderTriggerId}
                  type="button"
                  role="menuitem"
                  className="repo-actions-submenu-trigger"
                  aria-haspopup="menu"
                  aria-expanded={folderMenuOpen}
                  aria-controls={folderMenuId}
                  onClick={(event) => {
                    event.stopPropagation()
                    setFolderMenuPosition(null)
                    setFolderMenuOpen((current) => {
                      const next = !current
                      if (next) setRemoveFolderMenuOpen(false)
                      return next
                    })
                  }}
                >
                  <span>{t('library.folder.addTo')}</span>
                  <ChevronRightIcon className="menu-chevron-icon" />
                </button>
              </div>
            )}
            {onRemoveFromFolder && removableFolders.length > 0 && (
              <div
                className={`repo-actions-submenu ${removeFolderMenuOpen ? 'open' : ''}`}
                onMouseEnter={() => {
                  setRemoveFolderMenuPosition(null)
                  setRemoveFolderMenuOpen(true)
                  setFolderMenuOpen(false)
                }}
              >
                <button
                  ref={removeFolderTriggerRef}
                  id={removeFolderTriggerId}
                  type="button"
                  role="menuitem"
                  className="repo-actions-submenu-trigger"
                  aria-haspopup="menu"
                  aria-expanded={removeFolderMenuOpen}
                  aria-controls={removeFolderMenuId}
                  onClick={(event) => {
                    event.stopPropagation()
                    setRemoveFolderMenuPosition(null)
                    setRemoveFolderMenuOpen((current) => {
                      const next = !current
                      if (next) setFolderMenuOpen(false)
                      return next
                    })
                  }}
                >
                  <span>{t('library.folder.removeFrom')}</span>
                  <ChevronRightIcon className="menu-chevron-icon" />
                </button>
              </div>
            )}
            {hasPersonalizationActions && (
              <div className="repo-actions-menu-separator" role="separator" />
            )}
            {onPickArt && (
              <button
                type="button"
                role="menuitem"
                onClick={handlePickArt}
              >
                {t('art.changeCover')}
              </button>
            )}
            {onPickBackground && (
              <button
                type="button"
                role="menuitem"
                onClick={handlePickBackground}
              >
                {t('art.changeBackground')}
              </button>
            )}
            {art?.coverPath && onClearArt && (
              <button type="button" role="menuitem" onClick={handleClearArt}>
                {t('art.resetCover')}
              </button>
            )}
            {art?.backgroundPath && onClearBackground && (
              <button type="button" role="menuitem" onClick={handleClearBackground}>
                {t('art.resetBackground')}
              </button>
            )}
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
          {folderMenuOpen && (
            <div
              ref={folderMenuRef}
              id={folderMenuId}
              className="repo-actions-submenu-panel"
              role="menu"
              aria-labelledby={folderTriggerId}
              style={{
                left: folderMenuPosition?.x ?? 0,
                top: folderMenuPosition?.y ?? 0,
                visibility: folderMenuPosition ? 'visible' : 'hidden',
              }}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={handleMenuKeyDown}
            >
              {onCreateFolder && (
                <button type="button" role="menuitem" onClick={handleCreateFolder}>
                  {t('library.folder.createNew')}
                </button>
              )}
              {onMoveToUncategorized && (
                <button type="button" role="menuitem" onClick={handleMoveToUncategorized}>
                  {t('library.folder.uncategorized')}
                </button>
              )}
              {folders.length > 0 && (
                <span className="repo-actions-menu-label">{t('library.folder.title')}</span>
              )}
              {folders.map((folder) => (
                <button
                  key={folder.id}
                  type="button"
                  role="menuitem"
                  onClick={(event) => handleMoveToFolder(event, folder.id)}
                >
                  {folder.name}
                </button>
              ))}
            </div>
          )}
          {removeFolderMenuOpen && (
            <div
              ref={removeFolderMenuRef}
              id={removeFolderMenuId}
              className="repo-actions-submenu-panel"
              role="menu"
              aria-labelledby={removeFolderTriggerId}
              style={{
                left: removeFolderMenuPosition?.x ?? 0,
                top: removeFolderMenuPosition?.y ?? 0,
                visibility: removeFolderMenuPosition ? 'visible' : 'hidden',
              }}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={handleMenuKeyDown}
            >
              {removableFolders.map((folder) => (
                <button
                  key={folder.id}
                  type="button"
                  role="menuitem"
                  onClick={(event) => handleRemoveFromFolder(event, folder.id)}
                >
                  {folder.name}
                </button>
              ))}
            </div>
          )}
        </>,
        document.getElementById('app-overlay-root') ?? document.body,
      )}
    </article>
  )
}

export default RepoCard
