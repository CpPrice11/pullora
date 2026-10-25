import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { DownloadProgress, GitHubSearchResult, InstalledApp, ProjectArt, DetectedInstallation, InstallationStatus } from '../../../types'
import { addToFavorites, checkIsFavorite, removeFromFavorites } from '../../../services/favorites'
import { projectArtCoverCropStyle, projectArtCoverUrl } from '../../../services/projectArt'
import { useI18n } from '../../../i18n'
import { formatBytes, formatDate, formatNumber } from '../../../utils/format'
import { canCancel, currentStage, downloadPercent, stageLabel } from '../../../utils/downloadProgress'
import { getLibraryAppStatus } from '../libraryStatus'
import type { LibraryViewMode } from '../libraryViewControls'
import { focusFirstMenuItem, handleMenuKeyboard } from '../../../utils/menuKeyboard'
import { ChevronRightIcon, MoreHorizontalIcon, PlayIcon, UpdateIcon } from '../../../components/ui/Icons'
import { openExternalUrl, openWebsiteUrl, projectWebsiteUrl } from '../../../services/updates'
import { getLocalizedErrorMessage } from '../../../services/tauri'
import './SearchComponents.css'

const REPO_MENU_OPEN_EVENT = 'pullora:repo-menu-open'
type RepoSubmenu = 'add-folder' | 'remove-folder' | 'cover' | 'background'

interface RepoCardProps {
  viewMode?: LibraryViewMode
  repo: GitHubSearchResult
  installedApp?: InstalledApp
  installationHealth?: InstallationStatus
  latestVersion?: string
  art?: ProjectArt
  defaultIcon?: string
  download?: DownloadProgress
  onCancelDownload?: (id: string) => Promise<void>
  onRetryDownload?: (download: DownloadProgress) => Promise<void>
  runtimeStatus?: 'running' | 'unknown'
  discovered?: DetectedInstallation[]
  onAdopt?: (app: DetectedInstallation) => Promise<void>
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
  busy?: boolean
  onError?: (error: unknown) => void
}

function RepoCard({
  viewMode = 'cards',
  repo,
  installedApp,
  latestVersion,
  art,
  defaultIcon,
  download,
  onCancelDownload,
  onRetryDownload,
  runtimeStatus,
  installationHealth,
  discovered = [],
  onAdopt,
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
  busy = false,
  onError,
}: RepoCardProps) {
  const { language, t } = useI18n()
  const [isFav, setIsFav] = useState(false)
  const [favLoading, setFavLoading] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [actionsOpen, setActionsOpen] = useState(false)
  const [submenuOpen, setSubmenuOpen] = useState<RepoSubmenu | null>(null)
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | null>(null)
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null)
  const [submenuPosition, setSubmenuPosition] = useState<{ x: number; y: number } | null>(null)
  const cardRef = useRef<HTMLElement | null>(null)
  const menuReturnFocusRef = useRef<HTMLElement | null>(null)
  const actionsRef = useRef<HTMLDivElement | null>(null)
  const submenuTriggerRef = useRef<HTMLButtonElement | null>(null)
  const submenuRef = useRef<HTMLDivElement | null>(null)
  const menuId = useId()
  const submenuTriggerId = (kind: RepoSubmenu) => `${menuId}-${kind}-trigger`
  const submenuPanelId = (kind: RepoSubmenu) => `${menuId}-${kind}-menu`
  const closeActions = (restoreFocus = true) => {
    setActionsOpen(false)
    if (restoreFocus && actionsOpen) (menuReturnFocusRef.current ?? cardRef.current)?.focus()
  }
  const status = getLibraryAppStatus(installedApp, latestVersion)
  const isInstalled = status !== 'available'
  const onlyExternal = Boolean(installedApp?.versions.length && installedApp.versions.every((v) => v.installKind === 'external'))
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
    menuReturnFocusRef.current = document.activeElement instanceof HTMLElement
      && cardRef.current?.contains(document.activeElement) ? document.activeElement : cardRef.current
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
    if ((event.target as HTMLElement).closest('a, button, input')) return
    if (onBulkSelect && (event.ctrlKey || event.metaKey || event.shiftKey)) {
      event.preventDefault()
      onBulkSelect(event.shiftKey)
      return
    }
    handlePreview()
  }

  const updatedDate = formatDate(repo.updated_at, language)
  const statusLabel = t(repo.website_url ? 'repo.webApp' : installationHealth === 'missing' ? 'repo.needsRepair' : installationHealth === 'unavailable' ? 'repo.runtimeUnknown' : `repo.${status}`)
  const operation = download && !['completed', 'failed'].includes(currentStage(download)) ? download : null
  const failedDownload = download && currentStage(download) === 'failed' ? download : null
  const retryFailed = async (event: React.MouseEvent) => {
    event.stopPropagation()
    if (retrying || !failedDownload || !onRetryDownload) return
    closeActions()
    setRetrying(true)
    try { await onRetryDownload(failedDownload) }
    catch (error) { onError?.(error) }
    finally { setRetrying(false) }
  }
  const needsRepair = installationHealth === 'missing'
  const fileCheckBlocked = installationHealth === 'unavailable'
  const primaryLabel = repo.website_url ? t('repo.visit') : runtimeStatus ? t(runtimeStatus === 'running' ? 'repo.running' : 'repo.runtimeUnknown') : fileCheckBlocked ? t('repo.filesUnavailable') : needsRepair ? t('repo.reinstall') : failedDownload && onRetryDownload
    ? t(isInstalled ? 'repo.launch' : 'download.retry')
    : hasUpdate ? t('repo.updateAction') : isInstalled ? t('repo.launch') : t('repo.install')
  const primaryAction = repo.website_url ? handleInstall : needsRepair ? handleInstall : failedDownload && onRetryDownload
    ? isInstalled ? handleLaunch : retryFailed
    : isInstalled && !hasUpdate ? handleLaunch : handleInstall
  const operationStage = operation ? stageLabel(currentStage(operation), t) : null
  const progress = operation ? downloadPercent(operation) : 0
  const progressKnown = Boolean(operation && operation.totalSize > 0)
  const progressText = `${formatNumber(progress, language)}%`
  const actionBusy = busy || Boolean(operation) || retrying
  const runtimeBlocked = Boolean(runtimeStatus)
  const cancelOperation = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    if (!operation || !onCancelDownload || cancelling) return
    setCancelling(true)
    try {
      await onCancelDownload(operation.id)
      window.requestAnimationFrame(() => {
        if (document.activeElement === document.body) cardRef.current?.querySelector<HTMLButtonElement>('.repo-primary-action')?.focus({ preventScroll: true })
      })
    } catch (error) {
      onError?.(error)
    } finally {
      setCancelling(false)
    }
  }
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
  const websiteUrl = projectWebsiteUrl(repo.website_url ?? repo.homepage)
  const titleId = `${menuId}-title`
  const openLink = async (event: React.MouseEvent<HTMLAnchorElement>, url: string, website = false) => {
    event.stopPropagation()
    if (!('__TAURI_INTERNALS__' in window)) return
    event.preventDefault()
    try {
      await (website ? openWebsiteUrl(url) : openExternalUrl(url))
    } catch (error) {
      onError?.(error)
    }
  }

  const links = (
    <div className="repo-card-links">
      {onBulkSelect && (
        <input
          type="checkbox"
          className="repo-card-selection"
          checked={isBulkSelected}
          aria-label={t('repo.select', { name: repo.name })}
          onClick={(event) => event.stopPropagation()}
          onChange={() => onBulkSelect(false)}
        />
      )}
      {websiteUrl && (
        <a href={websiteUrl} target="_blank" rel="noopener noreferrer" aria-label={t('repo.websiteFor', { name: repo.name })} onClick={(event) => { void openLink(event, websiteUrl, true) }}>
          {t('repo.website')}<ChevronRightIcon />
        </a>
      )}
      <a href={repo.html_url} target="_blank" rel="noopener noreferrer" aria-label={t('repo.githubFor', { name: repo.name })} onClick={(event) => { void openLink(event, repo.html_url) }}>
        {t('repo.github')}<ChevronRightIcon />
      </a>
    </div>
  )
  const heading = (
    <div className="repo-card-heading">
      <div className="repo-card-media">
        <div className="owner-avatar">
          <img
            src={coverUrl ?? defaultIcon ?? repo.owner.avatar_url}
            alt=""
            className={coverUrl ? 'project-art-cover' : defaultIcon ? 'project-default-icon' : undefined}
            style={coverUrl ? projectArtCoverCropStyle(art) : undefined}
            onError={(event) => {
              const image = event.currentTarget
              if (defaultIcon && image.getAttribute('src') === coverUrl) image.src = defaultIcon
              else if (image.getAttribute('src') !== repo.owner.avatar_url) image.src = repo.owner.avatar_url
            }}
          />
        </div>
      </div>
      <div className="repo-info">
        <div className="repo-title-line">
          <h3 className="repo-name" id={titleId} title={repo.name}>
            <button type="button" onClick={(event) => { event.stopPropagation(); handlePreview() }} aria-label={t('repo.detailsFor', { name: repo.name })}>
              {repo.name}
            </button>
          </h3>
        </div>
        <div className="repo-owner">{repo.owner.login}/{repo.name}</div>
      </div>
    </div>
  )
  const description = (
    <p className="repo-description" title={repo.description ?? undefined}>
      {repo.description || t('repo.noDescription')}
    </p>
  )
  const summary = (
    <div className="repo-card-summary">
      <span className={`repo-status ${installationHealth === 'missing' ? 'update' : status}`}>{statusLabel}</span>
      {runtimeStatus && <span className="repo-runtime-status" role="status" title={t('repo.closeToChange')}>{t(runtimeStatus === 'running' ? 'repo.running' : 'repo.runtimeUnknown')}</span>}
      {installationHealth && installationHealth !== 'ready' && <span className="repo-runtime-status repo-installation-status" role="status">{t(needsRepair ? 'repo.filesMissing' : 'repo.filesUnavailable')}</span>}
      <div className="repo-meta">
        {!installedApp && !repo.website_url && <span>{t('library.ops.notInstalled')}</span>}
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
  )
  const recovery = (
    <>
      {(!isInstalled || needsRepair) && discovered.length > 0 && onAdopt && <div className="repo-install-recovery repo-discovered">
        <p>{t('repo.connectHelp')}</p>
        {discovered.map((app) => <div className="repo-discovered-item" key={app.executablePath}>
          <strong>{t('repo.discovered', { version: app.version })}</strong>
          <span className="repo-discovered-path">{app.installDir.replace(/^\\\\\?\\/, '')}</span>
          <button type="button" className="secondary-btn" disabled={actionBusy} aria-label={t('repo.connectFor', { name: repo.name })} onClick={(event) => {
            event.stopPropagation(); void onAdopt(app).catch((error) => onError?.(error))
          }}><ChevronRightIcon />{t('repo.connect')}</button>
        </div>)}
      </div>}
      {failedDownload && (
        <div className="repo-install-recovery">
          <p id={`${titleId}-install-error`} role="status">{getLocalizedErrorMessage(failedDownload.error)}</p>
          <div>
            {isInstalled && onRetryDownload && <button type="button" className="secondary-btn" disabled={actionBusy || runtimeBlocked} aria-busy={retrying} onClick={retryFailed}><UpdateIcon />{t('download.retry')}</button>}
            {onShowVersions && <button type="button" className="secondary-btn" disabled={actionBusy} onClick={handleShowVersions}><ChevronRightIcon />{t('library.installChooseFile')}</button>}
          </div>
        </div>
      )}
      {download?.checksumStatus && <span className="repo-checksum" role="status">{t(`download.checksum.${download.checksumStatus}`)}</span>}
    </>
  )
  const actions = (
    <div className="repo-card-actions">
      {operation ? (
        <div className="repo-card-operation">
          <div className="repo-operation-label">
            <span role="status" aria-live="polite">{operationStage}</span>
            {progressKnown && <span>{progressText}</span>}
          </div>
          <div className="repo-operation-track" role="progressbar" aria-label={t('repo.operationFor', { name: repo.name })} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressKnown ? progress : undefined} aria-valuetext={progressKnown ? `${operationStage}: ${progressText}` : operationStage ?? undefined}>
            <span className="repo-operation-fill" style={{ transform: `scaleX(${progressKnown ? progress / 100 : 0})` }} />
          </div>
          <span className="repo-operation-size">
            {formatBytes(operation.downloadedSize, language)}{progressKnown ? ` / ${formatBytes(operation.totalSize, language)}` : ''}
          </span>
        </div>
      ) : (
        <button type="button" className="repo-primary-action" onClick={primaryAction} disabled={actionBusy || runtimeBlocked || fileCheckBlocked} aria-busy={actionBusy} title={runtimeBlocked ? t('repo.closeToChange') : undefined} aria-describedby={failedDownload ? `${titleId}-install-error` : undefined}>
          {hasUpdate || actionBusy ? <UpdateIcon /> : isInstalled ? <PlayIcon /> : <ChevronRightIcon />}
          {runtimeBlocked ? primaryLabel : actionBusy ? t('repo.busy') : primaryLabel}
        </button>
      )}
      {operation && canCancel(operation) && onCancelDownload && (
        <button type="button" className="repo-cancel-download" aria-label={t('repo.cancelFor', { name: repo.name })} disabled={cancelling} aria-busy={cancelling} onClick={(event) => { void cancelOperation(event) }}>
          {t('download.cancel')}
        </button>
      )}
      <button
        type="button"
        className="repo-more-action"
        aria-label={t('projectActions.open')}
        aria-haspopup="menu"
        aria-expanded={actionsOpen}
        onClick={(event) => {
          event.stopPropagation()
          const bounds = event.currentTarget.getBoundingClientRect()
          openActions({ x: bounds.left, y: bounds.bottom })
        }}
      >
        <MoreHorizontalIcon />
      </button>
    </div>
  )

  const Container = viewMode === 'table' ? 'tr' : 'article'
  return (
    <Container
      ref={(element) => { cardRef.current = element }}
      className={`repo-card repo-card--${status} ${isSelected ? 'selected' : ''} ${isBulkSelected ? 'bulk-selected' : ''}`}
      onClick={handleCardClick}
      onContextMenu={handleContextMenu}
      tabIndex={0}
      role={viewMode === 'cards' ? 'group' : undefined}
      aria-labelledby={titleId}
      aria-current={isSelected ? 'true' : undefined}
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
      {viewMode === 'table' ? <>
        <td className="repo-table-identity" title={repo.description ?? undefined}>{heading}{links}{description}</td>
        <td className="repo-table-status">{summary}{recovery}</td>
        <td className="repo-table-version">{repo.website_url ? '—' : installedApp?.activeVersion ?? t('library.ops.notInstalled')}</td>
        <td className="repo-table-version">{repo.website_url ? '—' : latestVersion ?? t('library.ops.notChecked')}</td>
        <td className="repo-table-date"><time dateTime={repo.updated_at}>{updatedDate}</time></td>
        <td className="repo-table-actions">{actions}</td>
      </> : <>{links}{heading}{description}{summary}{recovery}{actions}</>}

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
                disabled={actionBusy || runtimeBlocked || fileCheckBlocked}
              >
                {primaryLabel}
              </button>
            {isInstalled && hasUpdate && (
              <button type="button" role="menuitem" onClick={handleLaunch} disabled={runtimeBlocked || needsRepair || fileCheckBlocked}>
                {t('repo.launch')}
              </button>
            )}
            {isInstalled && onOpenFolder && (
              <button type="button" role="menuitem" onClick={handleOpenFolder}>
                {t('download.openFolder')}
              </button>
            )}
            {onShowVersions && (
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
                  disabled={actionBusy || runtimeBlocked}
                >
                  {t(onlyExternal ? 'repo.disconnect' : 'installed.uninstallApp')}
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
    </Container>
  )
}

export default RepoCard
