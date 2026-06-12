import type { GitHubSearchResult, InstalledApp, ProjectArt } from '../../../types'
import type { CSSProperties } from 'react'
import { projectArtCoverUrl } from '../../../services/projectArt'
import { languageAccent, socialPreviewUrl } from '../storeCatalog'
import type { StoreInstallability } from '../hooks/useStoreCatalog'
import { useI18n } from '../../../i18n'

interface StorePreviewPanelProps {
  repo?: GitHubSearchResult
  art?: ProjectArt
  installedApp?: InstalledApp
  installability?: StoreInstallability
  favorite?: boolean
  onInstall: (repo: GitHubSearchResult) => void
  onOpenSource: (repo: GitHubSearchResult) => void
  onFavorite: (repo: GitHubSearchResult) => void
  onAiWorkspace?: (repo: GitHubSearchResult) => void
}

function StorePreviewPanel({
  repo,
  art,
  installedApp,
  installability,
  favorite = false,
  onInstall,
  onOpenSource,
  onFavorite,
  onAiWorkspace,
}: StorePreviewPanelProps) {
  const { language, t } = useI18n()

  if (!repo) {
    return (
      <aside className="store-preview-panel store-preview-panel--empty">
        <p>{t('store.preview.empty')}</p>
      </aside>
    )
  }

  const keyTopics = (repo.topics ?? []).slice(0, 5)
  const updatedDate = new Date(repo.updated_at).toLocaleDateString(language === 'en' ? 'en-US' : 'uk-UA')
  const imageUrl = projectArtCoverUrl(art) ?? socialPreviewUrl(repo)
  const isInstallable = Boolean(installability?.installable)
  const accent = languageAccent(repo.language)

  return (
    <aside
      className="store-preview-panel"
      style={{ '--store-preview-accent': accent } as CSSProperties}
    >
      <div className="store-preview-media">
        <img src={imageUrl} alt="" />
      </div>
      <div className="store-preview-copy">
        <h3>{repo.name}</h3>
        <p className="store-preview-owner">{repo.owner.login}/{repo.name}</p>
        {repo.description && <p>{repo.description}</p>}
        <div className="store-preview-tags">
          {repo.language && <span>{repo.language}</span>}
          {keyTopics.map((topic) => <span key={topic}>{topic}</span>)}
        </div>
        <div className="store-preview-facts">
          <div>
            <span>{t('library.ops.updated')}</span>
            <strong>{updatedDate}</strong>
          </div>
          <div>
            <span>{t('library.ops.stars')}</span>
            <strong>{repo.stargazers_count.toLocaleString()}</strong>
          </div>
          <div>
            <span>{t('library.ops.active')}</span>
            <strong>{installedApp?.activeVersion ?? t('library.ops.notInstalled')}</strong>
          </div>
          <div>
            <span>{t('library.ops.releases')}</span>
            <strong>{installability?.checking ? t('store.status.checking') : isInstallable ? t('store.status.installable') : t('store.status.source')}</strong>
          </div>
        </div>
        <div className="store-preview-actions">
          <button
            type="button"
            className={isInstallable ? 'store-primary-btn' : 'store-secondary-btn'}
            onClick={() => isInstallable ? onInstall(repo) : onOpenSource(repo)}
          >
            {t(isInstallable ? 'store.action.install' : 'store.action.source')}
          </button>
          <button type="button" className="store-secondary-btn" onClick={() => onFavorite(repo)}>
            {favorite ? t('repo.removeFavorite') : t('repo.addFavorite')}
          </button>
          {onAiWorkspace && (
            <button type="button" className="store-ghost-btn" onClick={() => onAiWorkspace(repo)}>
              {t('ai.openInWorkspace')}
            </button>
          )}
        </div>
      </div>
    </aside>
  )
}

export default StorePreviewPanel
