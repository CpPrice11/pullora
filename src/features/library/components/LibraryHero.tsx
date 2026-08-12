import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useI18n } from '../../../i18n'
import type { GitHubSearchResult, InstalledApp } from '../../../types'
import { formatNumber } from '../../../utils/format'
import { getLibraryAppStatus } from '../libraryStatus'
import { focusFirstMenuItem, handleMenuKeyboard } from '../../../utils/menuKeyboard'

interface LibraryHeroProps {
  repo: GitHubSearchResult
  installedApp?: InstalledApp
  latestVersion?: string | null
  cover?: string | null
  coverStyle?: CSSProperties
  backgroundStyle?: CSSProperties
  isFavorite: boolean
  favoriteBusy: boolean
  canResetCover: boolean
  canResetBackground: boolean
  onInstall: () => void
  onLaunch: () => void
  onToggleFavorite: () => void
  onShowDetails: () => void
  onOpenFolder: () => void
  onChangeCover: () => void
  onEditCover: () => void
  onChangeBackground: () => void
  onEditBackground: () => void
  onResetCover: () => void
  onResetBackground: () => void
  onUninstall: () => void
}

function HeroIcon({ name, filled = false }: { name: 'star' | 'more'; filled?: boolean }) {
  return (
    <svg className="library-action-icon" viewBox="0 0 24 24" aria-hidden="true">
      {name === 'star' ? (
        <path
          className={filled ? 'icon-fill' : undefined}
          d="m12 3 2.75 5.57 6.15.9-4.45 4.33 1.05 6.12L12 17.03l-5.5 2.89 1.05-6.12L3.1 9.47l6.15-.9Z"
        />
      ) : (
        <>
          <circle className="icon-fill" cx="5" cy="12" r="1.5" />
          <circle className="icon-fill" cx="12" cy="12" r="1.5" />
          <circle className="icon-fill" cx="19" cy="12" r="1.5" />
        </>
      )}
    </svg>
  )
}

export default function LibraryHero({
  repo,
  installedApp,
  latestVersion,
  cover,
  coverStyle,
  backgroundStyle,
  isFavorite,
  favoriteBusy,
  canResetCover,
  canResetBackground,
  onInstall,
  onLaunch,
  onToggleFavorite,
  onShowDetails,
  onOpenFolder,
  onChangeCover,
  onEditCover,
  onChangeBackground,
  onEditBackground,
  onResetCover,
  onResetBackground,
  onUninstall,
}: LibraryHeroProps) {
  const { language, t } = useI18n()
  const [actionsOpen, setActionsOpen] = useState(false)
  const actionsRef = useRef<HTMLDivElement | null>(null)
  const actionsTriggerRef = useRef<HTMLButtonElement | null>(null)
  const status = getLibraryAppStatus(installedApp, latestVersion)
  const hasUpdate = status === 'update'
  const isInstalled = status !== 'available'
  const statusLabel = t(`repo.${status}`)
  const primaryLabel = t(hasUpdate ? 'repo.updateAction' : isInstalled ? 'repo.launch' : 'repo.install')

  useEffect(() => {
    if (!actionsOpen) return

    const closeOutside = (event: PointerEvent) => {
      if (!actionsRef.current?.contains(event.target as Node)) setActionsOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    focusFirstMenuItem(actionsRef.current?.querySelector<HTMLElement>('[role="menu"]') ?? null)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
    }
  }, [actionsOpen])

  const runAction = (action: () => void) => {
    setActionsOpen(false)
    actionsTriggerRef.current?.focus()
    action()
  }

  return (
    <section
      className={`library-hero library-github-header ${cover ? 'library-hero--art' : 'library-hero--fallback'}`}
      aria-label={repo.name}
    >
      <div className="library-hero-background" style={backgroundStyle} aria-hidden="true" />
      <div className="library-hero-gradient" aria-hidden="true" />
      <div className="library-hero-accent" aria-hidden="true" />

      <div className="library-hero-content">
        <div className="library-hero-cover">
          <img
            src={cover || repo.owner.avatar_url}
            alt=""
            className={cover ? 'project-art-cover' : undefined}
            style={cover ? coverStyle : undefined}
          />
        </div>

        <div className="library-hero-main">
          <div className="repo-status-row">
            <span className={`repo-status ${status}`}>{statusLabel}</span>
            {repo.language && <span className="repo-lang">{repo.language}</span>}
            <button
              type="button"
              className={`hero-favorite-btn ${isFavorite ? 'active' : ''}`}
              onClick={onToggleFavorite}
              disabled={favoriteBusy}
              title={isFavorite ? t('repo.removeFavorite') : t('repo.addFavorite')}
              aria-label={isFavorite ? t('repo.removeFavorite') : t('repo.addFavorite')}
            >
              <HeroIcon name="star" filled={isFavorite} />
            </button>
          </div>
          <h2>{repo.name}</h2>
          <p className="library-hero-repo">{repo.owner.login}/{repo.name}</p>
          {repo.description && <p className="library-hero-description">{repo.description}</p>}
          <div className="library-hero-meta">
            <span>{t('repo.stars', { count: formatNumber(repo.stargazers_count, language) })}</span>
            {installedApp && <span>{t('repo.active', { version: installedApp.activeVersion })}</span>}
            {hasUpdate && latestVersion && <span>{t('repo.new', { version: latestVersion })}</span>}
          </div>
        </div>

        <div className="library-hero-actions library-github-actions">
          <button type="button" className="hero-primary-btn" onClick={isInstalled && !hasUpdate ? onLaunch : onInstall}>
            {primaryLabel}
          </button>
          <div className={`project-actions-menu hero-actions-menu ${actionsOpen ? 'open' : ''}`} ref={actionsRef}>
            <button
              ref={actionsTriggerRef}
              type="button"
              className="project-actions-trigger"
              aria-haspopup="menu"
              aria-expanded={actionsOpen}
              aria-label={t('projectActions.open')}
              onClick={() => setActionsOpen((current) => !current)}
            >
              <HeroIcon name="more" />
            </button>
            {actionsOpen && (
              <div
                className="project-actions-popover"
                role="menu"
                aria-label={t(isInstalled ? 'installed.moreActions' : 'art.actions')}
                onKeyDown={(event) => handleMenuKeyboard(event, () => {
                  setActionsOpen(false)
                  actionsTriggerRef.current?.focus()
                })}
              >
                {isInstalled && <button type="button" role="menuitem" onClick={() => runAction(onShowDetails)}>{t('details.open')}</button>}
                {isInstalled && <button type="button" role="menuitem" onClick={() => runAction(onOpenFolder)}>{t('installed.folder')}</button>}
                {canResetCover ? (
                  <>
                    <button type="button" role="menuitem" onClick={() => runAction(onEditCover)}>{t('art.editCover')}</button>
                    <button type="button" role="menuitem" onClick={() => runAction(onChangeCover)}>{t('art.replaceCover')}</button>
                  </>
                ) : (
                  <button type="button" role="menuitem" onClick={() => runAction(onChangeCover)}>{t('art.changeCover')}</button>
                )}
                {canResetBackground ? (
                  <>
                    <button type="button" role="menuitem" onClick={() => runAction(onEditBackground)}>{t('art.editBackground')}</button>
                    <button type="button" role="menuitem" onClick={() => runAction(onChangeBackground)}>{t('art.replaceBackground')}</button>
                  </>
                ) : (
                  <button type="button" role="menuitem" onClick={() => runAction(onChangeBackground)}>{t('art.changeBackground')}</button>
                )}
                {canResetCover && <button type="button" role="menuitem" onClick={() => runAction(onResetCover)}>{t('art.resetCover')}</button>}
                {canResetBackground && <button type="button" role="menuitem" onClick={() => runAction(onResetBackground)}>{t('art.resetBackground')}</button>}
                {isInstalled && (
                  <button type="button" role="menuitem" className="danger-menu-item" onClick={() => runAction(onUninstall)}>
                    {t('installed.uninstallApp')}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
