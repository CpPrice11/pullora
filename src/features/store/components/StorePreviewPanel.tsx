import type { GitHubSearchResult, InstalledApp, ProjectArt } from '../../../types'
import type { CSSProperties } from 'react'
import { projectArtCoverUrl } from '../../../services/projectArt'
import { languageAccent, socialPreviewUrl } from '../storeCatalog'
import type { StoreInstallability } from '../hooks/useStoreCatalog'
import { releaseAssetKindLabelKey, releaseAssetKindsForStatus } from '../assetClassifier'
import { classifyStoreProject, storeProjectTypeLabelKey } from '../projectClassifier'
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
  onDetails: (repo: GitHubSearchResult) => void
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
  onDetails,
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
  const projectType = classifyStoreProject(repo)
  const isInstallable = Boolean(installability?.installable)
  const isIncompatible = Boolean(
    installability?.checked
    && !installability.installable
    && installability.incompatibleAssetCount,
  )
  const assetKinds = releaseAssetKindsForStatus(installability)
  const latestTag = installability?.latestTag ?? null
  const accent = languageAccent(repo.language)

  return (
    <aside
      className="store-preview-panel"
      style={{ '--store-preview-accent': accent } as CSSProperties}
    >
      <div className="store-preview-copy">
        <h3>{repo.name}</h3>
        <p className="store-preview-owner">{repo.owner.login}/{repo.name}</p>
        <div className="store-preview-tags">
          {repo.language && <span>{repo.language}</span>}
          <span className={`store-project-type store-project-type--${projectType}`}>
            {t(storeProjectTypeLabelKey(projectType))}
          </span>
          {assetKinds.map((kind) => (
            <span key={kind} className={`store-asset-badge store-asset-badge--${kind}`}>
              {t(releaseAssetKindLabelKey(kind))}
            </span>
          ))}
          {latestTag && <span>{t('store.latestVersion', { version: latestTag })}</span>}
          {keyTopics.map((topic) => <span key={topic}>{topic}</span>)}
        </div>
        <div className="store-preview-media">
          <div className="store-preview-main-shot">
            <img src={imageUrl} alt="" />
          </div>
          <div className="store-preview-shots" aria-hidden="true">
            <div className="store-preview-shot"><img src={socialPreviewUrl(repo)} alt="" /></div>
            <div className="store-preview-shot"><img src={repo.owner.avatar_url} alt="" /></div>
            <div className="store-preview-shot"><img src={imageUrl} alt="" /></div>
            <div className="store-preview-more">+{Math.max((repo.topics ?? []).length, 3)}</div>
          </div>
        </div>
        {repo.description && <p>{repo.description}</p>}
        <div className="store-preview-facts">
          <span>{t('repo.updated', { date: updatedDate })}</span>
          <span>{repo.language ?? t('details.unknown')}</span>
          <span>{repo.html_url}</span>
          <span>{installedApp?.activeVersion ?? t('library.ops.notInstalled')}</span>
          <span>
            {installability?.checking
              ? t('store.status.checking')
              : isInstallable
                ? t('store.status.installable')
                : isIncompatible
                  ? t('store.status.incompatible')
                  : t('store.status.source')}
          </span>
          {installability?.platform && (
            <span>{t(`store.platform.${installability.platform}`)}</span>
          )}
          {installability?.architecture && (
            <span>{t(`store.architecture.${installability.architecture}`)}</span>
          )}
          {installability?.installableAssetCount ? (
            <span>{t('store.installableAssets', { count: installability.installableAssetCount })}</span>
          ) : null}
          {latestTag && <span>{t('store.latestVersion', { version: latestTag })}</span>}
          <span>{t('repo.stars', { count: repo.stargazers_count.toLocaleString() })}</span>
        </div>
        <div className="store-preview-actions">
          <button
            type="button"
            className={isInstallable ? 'store-primary-btn' : 'store-secondary-btn'}
            onClick={() => isInstallable ? onInstall(repo) : onOpenSource(repo)}
          >
            {t(isInstallable ? 'store.action.installLatest' : 'store.action.source')}
          </button>
          <button type="button" className="store-secondary-btn" onClick={() => onFavorite(repo)}>
            {favorite ? t('repo.removeFavorite') : t('repo.addFavorite')}
          </button>
          <button type="button" className="store-ghost-btn" onClick={() => onDetails(repo)}>
            {t('store.action.details')}
          </button>
        </div>
      </div>
    </aside>
  )
}

export default StorePreviewPanel
