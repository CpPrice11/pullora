import { useEffect, useMemo, useState } from 'react'
import type { GitHubRelease, GitHubSearchResult, InstalledApp, ProjectArt } from '../../../types'
import { getReleases } from '../../../services/github'
import { projectArtCoverUrl } from '../../../services/projectArt'
import { classifyReleaseAsset, releaseAssetKindLabelKey } from '../assetClassifier'
import { socialPreviewUrl } from '../storeCatalog'
import type { StoreInstallability } from '../hooks/useStoreCatalog'
import { useI18n } from '../../../i18n'

interface StoreAppDetailsModalProps {
  repo: GitHubSearchResult
  art?: ProjectArt
  installedApp?: InstalledApp
  installability?: StoreInstallability
  favorite?: boolean
  onClose: () => void
  onInstall: (repo: GitHubSearchResult, releaseTag?: string | null) => void
  onOpenSource: (repo: GitHubSearchResult) => void
  onFavorite: (repo: GitHubSearchResult) => void
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function compactNotes(body: string | null | undefined) {
  if (!body?.trim()) return ''
  return body
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[\s>*-]+/gm, '')
    .trim()
}

function StoreAppDetailsModal({
  repo,
  art,
  installedApp,
  installability,
  favorite = false,
  onClose,
  onInstall,
  onOpenSource,
  onFavorite,
}: StoreAppDetailsModalProps) {
  const { language, t } = useI18n()
  const [releases, setReleases] = useState<GitHubRelease[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [includePrereleases, setIncludePrereleases] = useState(false)
  const [selectedReleaseId, setSelectedReleaseId] = useState<number | null>(null)
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null)

  const loadReleases = async () => {
    setLoading(true)
    setError(null)
    try {
      const items = await getReleases(repo.owner.login, repo.name)
      setReleases(items)
      setLastLoadedAt(new Date())
      setSelectedReleaseId((current) => {
        if (current && items.some((release) => release.id === current)) return current
        return items.find((release) => !release.draft && !release.prerelease)?.id
          ?? items.find((release) => !release.draft)?.id
          ?? null
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('store.details.releaseError'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadReleases()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo.owner.login, repo.name])

  const visibleReleases = useMemo(() => {
    return releases.filter((release) =>
      !release.draft && (includePrereleases || !release.prerelease),
    )
  }, [includePrereleases, releases])

  const selectedRelease = useMemo(() => {
    return visibleReleases.find((release) => release.id === selectedReleaseId)
      ?? visibleReleases[0]
      ?? null
  }, [selectedReleaseId, visibleReleases])

  const imageUrl = projectArtCoverUrl(art) ?? socialPreviewUrl(repo)
  const updatedDate = new Date(repo.updated_at).toLocaleDateString(language === 'en' ? 'en-US' : 'uk-UA')
  const releaseDate = selectedRelease?.published_at
    ? new Date(selectedRelease.published_at).toLocaleDateString(language === 'en' ? 'en-US' : 'uk-UA')
    : null
  const notes = compactNotes(selectedRelease?.body)
  const installable = installability?.installable ?? repo.has_releases
  const lastLoadedTime = lastLoadedAt?.toLocaleTimeString(language === 'en' ? 'en-US' : 'uk-UA', {
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className="store-details-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="store-details-modal"
        role="dialog"
        aria-modal="true"
        aria-label={t('store.details.title', { name: repo.name })}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="store-details-header">
          <div className="store-details-identity">
            <img src={imageUrl} alt="" />
            <div>
              <span>{repo.owner.login}/{repo.name}</span>
              <h2>{repo.name}</h2>
            </div>
          </div>
          <button type="button" className="store-details-close" onClick={onClose} aria-label={t('release.close')}>
            x
          </button>
        </header>

        <div className="store-details-body">
          <aside className="store-details-summary">
            <div className="store-details-about">
              <span className="store-details-kicker">{t('store.details.about')}</span>
              <p>{repo.description ?? t('store.details.noDescription')}</p>
              <div className="store-details-topic-list">
                {repo.language && <span>{repo.language}</span>}
                {(repo.topics ?? []).slice(0, 8).map((topic) => <span key={topic}>{topic}</span>)}
              </div>
            </div>

            <dl className="store-details-meta">
              <div>
                <dt>{t('library.ops.owner')}</dt>
                <dd>{repo.owner.login}</dd>
              </div>
              <div>
                <dt>{t('library.ops.updated')}</dt>
                <dd>{updatedDate}</dd>
              </div>
              <div>
                <dt>{t('library.ops.stars')}</dt>
                <dd>{repo.stargazers_count.toLocaleString()}</dd>
              </div>
              <div>
                <dt>{t('library.ops.language')}</dt>
                <dd>{repo.language ?? t('details.unknown')}</dd>
              </div>
              <div>
                <dt>{t('library.ops.active')}</dt>
                <dd>{installedApp?.activeVersion ?? t('library.ops.notInstalled')}</dd>
              </div>
              <div>
                <dt>{t('library.ops.releases')}</dt>
                <dd>{releases.length.toLocaleString()}</dd>
              </div>
            </dl>

            <div className="store-details-actions">
              <button
                type="button"
                className={installable ? 'store-primary-btn' : 'store-secondary-btn'}
                onClick={() => installable ? onInstall(repo, selectedRelease?.tag_name ?? null) : onOpenSource(repo)}
              >
                {t(installable ? 'store.details.installThisRelease' : 'store.action.source')}
              </button>
              <button type="button" className="store-secondary-btn" onClick={() => onFavorite(repo)}>
                {favorite ? t('repo.removeFavorite') : t('repo.addFavorite')}
              </button>
              <button type="button" className="store-ghost-btn" onClick={() => onOpenSource(repo)}>
                {t('store.action.source')}
              </button>
            </div>
          </aside>

          <main className="store-details-main">
            <div className="store-details-toolbar">
              <div>
                <h3>{t('store.details.releases')}</h3>
                <span>
                  {lastLoadedTime
                    ? t('store.details.loadedAt', { time: lastLoadedTime })
                    : t('store.details.loading')}
                </span>
              </div>
              <label className="store-details-toggle">
                <input
                  type="checkbox"
                  checked={includePrereleases}
                  onChange={(event) => setIncludePrereleases(event.target.checked)}
                />
                {t('store.details.includePrereleases')}
              </label>
            </div>

            {error && <div className="store-details-error">{error}</div>}
            {loading && <div className="store-details-empty">{t('store.details.loading')}</div>}
            {!loading && visibleReleases.length === 0 && (
              <div className="store-details-empty">{t('store.details.noReleases')}</div>
            )}

            {visibleReleases.length > 0 && (
              <div className="store-details-release-grid">
                <div className="store-details-release-list">
                  {visibleReleases.map((release) => (
                    <button
                      key={release.id}
                      type="button"
                      className={selectedRelease?.id === release.id ? 'active' : ''}
                      onClick={() => setSelectedReleaseId(release.id)}
                    >
                      <strong>{release.tag_name}</strong>
                      <span>{release.prerelease ? t('release.statusPrerelease') : t('release.statusStable')}</span>
                    </button>
                  ))}
                </div>

                <div className="store-details-release-panel">
                  <div className="store-details-release-head">
                    <div>
                      <span>{releaseDate ?? t('details.unknown')}</span>
                      <h4>{selectedRelease?.name || selectedRelease?.tag_name}</h4>
                    </div>
                    {selectedRelease && (
                      <button
                        type="button"
                        className="store-secondary-btn"
                        onClick={() => onInstall(repo, selectedRelease.tag_name)}
                      >
                        {t('store.details.installThisRelease')}
                      </button>
                    )}
                  </div>

                  <section className="store-details-assets">
                    <h5>{t('store.details.assets')}</h5>
                    {selectedRelease?.assets.length ? selectedRelease.assets.map((asset) => {
                      const kind = classifyReleaseAsset(asset)
                      return (
                        <div key={asset.id} className={`store-details-asset store-details-asset--${kind}`}>
                          <div>
                            <strong>{asset.name}</strong>
                            <span>{t(releaseAssetKindLabelKey(kind))}</span>
                          </div>
                          <span>{formatBytes(asset.size)}</span>
                          <span>{t('store.details.downloads', { count: asset.download_count.toLocaleString() })}</span>
                        </div>
                      )
                    }) : (
                      <p className="store-details-empty-inline">{t('store.details.noAssets')}</p>
                    )}
                  </section>

                  <section className="store-details-notes">
                    <h5>{t('store.details.releaseNotes')}</h5>
                    {notes ? <pre>{notes.slice(0, 2200)}</pre> : <p>{t('store.details.noNotes')}</p>}
                  </section>
                </div>
              </div>
            )}
          </main>
        </div>
      </section>
    </div>
  )
}

export default StoreAppDetailsModal

