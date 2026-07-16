import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { GitHubSearchResult, InstalledApp, ProjectArt } from '../../../types'
import { addToFavorites, checkIsFavorite, removeFromFavorites } from '../../../services/favorites'
import { projectArtCoverUrl } from '../../../services/projectArt'
import { useI18n } from '../../../i18n'
import { formatDate, formatNumber } from '../../../utils/format'
import { getLibraryAppStatus } from '../libraryStatus'
import { focusFirstMenuItem, handleMenuKeyboard } from '../../../utils/menuKeyboard'
import './SearchComponents.css'

interface RepoCardProps {
  repo: GitHubSearchResult
  installedApp?: InstalledApp
  latestVersion?: string
  art?: ProjectArt
  folders?: Array<{ id: string; name: string }>
  removableFolders?: Array<{ id: string; name: string }>
  isFavorite?: boolean
  isSelected?: boolean
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
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null)
  const cardRef = useRef<HTMLElement | null>(null)
  const actionsRef = useRef<HTMLDivElement | null>(null)
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
      if (!actionsRef.current?.contains(event.target as Node)) {
        setActionsOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActionsOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    focusFirstMenuItem(actionsRef.current?.querySelector<HTMLElement>('[role="menu"]') ?? null)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [actionsOpen])

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    handleMenuKeyboard(event, () => {
      setActionsOpen(false)
      cardRef.current?.focus()
    })
  }

  const toggleFavorite = async (event: React.MouseEvent) => {
    event.stopPropagation()
    setActionsOpen(false)
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
    setActionsOpen(false)
    onLaunch?.()
  }

  const handleInstall = (event: React.MouseEvent) => {
    event.stopPropagation()
    setActionsOpen(false)
    onInstall?.()
  }

  const handlePickArt = (event: React.MouseEvent) => {
    event.stopPropagation()
    setActionsOpen(false)
    onPickArt?.()
  }

  const handlePickBackground = (event: React.MouseEvent) => {
    event.stopPropagation()
    setActionsOpen(false)
    onPickBackground?.()
  }

  const handleClearArt = (event: React.MouseEvent) => {
    event.stopPropagation()
    setActionsOpen(false)
    onClearArt?.()
  }

  const handleClearBackground = (event: React.MouseEvent) => {
    event.stopPropagation()
    setActionsOpen(false)
    onClearBackground?.()
  }

  const handleRemoveFromFolder = (event: React.MouseEvent, folderId: string) => {
    event.stopPropagation()
    setActionsOpen(false)
    onRemoveFromFolder?.(folderId)
  }

  const handleUninstall = (event: React.MouseEvent) => {
    event.stopPropagation()
    setActionsOpen(false)
    onUninstall?.()
  }

  const handleOpenFolder = (event: React.MouseEvent) => {
    event.stopPropagation()
    setActionsOpen(false)
    onOpenFolder?.()
  }

  const handleShowVersions = (event: React.MouseEvent) => {
    event.stopPropagation()
    setActionsOpen(false)
    onShowVersions?.()
  }

  const handleMoveToFolder = (event: React.MouseEvent, folderId: string) => {
    event.stopPropagation()
    setActionsOpen(false)
    onMoveToFolder?.(folderId)
  }

  const handleMoveToUncategorized = (event: React.MouseEvent) => {
    event.stopPropagation()
    setActionsOpen(false)
    onMoveToUncategorized?.()
  }

  const handleCreateFolder = (event: React.MouseEvent) => {
    event.stopPropagation()
    setActionsOpen(false)
    onCreateFolder?.()
  }

  const handleContextMenu = (event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setMenuPosition({ x: event.clientX, y: event.clientY })
    setActionsOpen(true)
  }

  const handlePreview = () => {
    onPreview?.()
  }

  const updatedDate = formatDate(repo.updated_at, language)
  const statusLabel = t(`repo.${status}`)
  const primaryLabel = hasUpdate ? t('repo.updateAction') : isInstalled ? t('repo.launch') : t('repo.install')
  const primaryAction = isInstalled && !hasUpdate ? handleLaunch : handleInstall

  const coverUrl = projectArtCoverUrl(art)

  return (
    <article
      ref={cardRef}
      className={`repo-card repo-card--${status} ${isSelected ? 'selected' : ''}`}
      onClick={handlePreview}
      onContextMenu={handleContextMenu}
      tabIndex={0}
      role="button"
      aria-label={`${repo.name}, ${statusLabel}`}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return

        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          handlePreview()
          return
        }

        if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
          event.preventDefault()
          const bounds = event.currentTarget.getBoundingClientRect()
          setMenuPosition({ x: bounds.left + 24, y: bounds.top + 24 })
          setActionsOpen(true)
        }
      }}
    >
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

      {actionsOpen && menuPosition && createPortal(
        <div
          className="project-actions-menu repo-actions-menu repo-context-menu open"
          ref={actionsRef}
          style={{
            left: Math.max(8, Math.min(menuPosition.x, window.innerWidth - 288)),
            top: Math.max(8, Math.min(menuPosition.y, window.innerHeight - 8)),
            transform: menuPosition.y > window.innerHeight / 2 ? 'translateY(-100%)' : undefined,
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
                  setFolderMenuOpen(true)
                  setRemoveFolderMenuOpen(false)
                }}
              >
                <button
                  type="button"
                  role="menuitem"
                  className="repo-actions-submenu-trigger"
                  aria-haspopup="menu"
                  aria-expanded={folderMenuOpen}
                  onClick={(event) => {
                    event.stopPropagation()
                    setFolderMenuOpen((current) => {
                      const next = !current
                      if (next) setRemoveFolderMenuOpen(false)
                      return next
                    })
                  }}
                >
                  <span>{t('library.folder.addTo')}</span>
                  <span aria-hidden="true">›</span>
                </button>
                {folderMenuOpen && (
                  <div className="repo-actions-submenu-panel" role="menu">
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
              </div>
            )}
            {onRemoveFromFolder && removableFolders.length > 0 && (
              <div
                className={`repo-actions-submenu ${removeFolderMenuOpen ? 'open' : ''}`}
                onMouseEnter={() => {
                  setRemoveFolderMenuOpen(true)
                  setFolderMenuOpen(false)
                }}
              >
                <button
                  type="button"
                  role="menuitem"
                  className="repo-actions-submenu-trigger"
                  aria-haspopup="menu"
                  aria-expanded={removeFolderMenuOpen}
                  onClick={(event) => {
                    event.stopPropagation()
                    setRemoveFolderMenuOpen((current) => {
                      const next = !current
                      if (next) setFolderMenuOpen(false)
                      return next
                    })
                  }}
                >
                  <span>{t('library.folder.removeFrom')}</span>
                  <span aria-hidden="true">&gt;</span>
                </button>
                {removeFolderMenuOpen && (
                  <div className="repo-actions-submenu-panel" role="menu">
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
              </div>
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
              <button
                type="button"
                role="menuitem"
                className="danger-menu-item"
                onClick={handleUninstall}
              >
                {t('installed.uninstallApp')}
              </button>
            )}
          </div>
        </div>,
        document.body,
      )}
    </article>
  )
}

export default RepoCard
