import { useEffect, useMemo, useRef, useState } from 'react'
import { useReleases } from '../../hooks/useGitHub'
import { useDownload } from '../../hooks/useDownload'
import { useSettings } from '../../hooks/useSettings'
import type { GitHubRelease, GitHubAsset } from '../../types'
import DownloadProgressPanel from '../Install/DownloadProgress'
import StatePanel from '../State/StatePanel'
import { useI18n } from '../../i18n'
import './SearchComponents.css'
import '../Modal/Modal.css'

interface ReleaseSelectorProps {
  owner: string
  repo: string
  displayName: string
  description?: string
  currentVersion?: string
  onClose: () => void
  onInstalled?: () => void
}

type AssetKind = 'portable' | 'installer' | 'archive' | 'unsupported'

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function getAssetKind(asset: GitHubAsset): AssetKind {
  const name = asset.name.toLowerCase()
  const isInstaller = name.includes('setup') ||
    name.includes('installer') ||
    name.endsWith('.msi')

  if (isInstaller) return 'installer'
  if (name.includes('portable') || name.endsWith('.appimage')) return 'portable'
  if (name.endsWith('.zip') || name.endsWith('.tar.gz') || name.endsWith('.tar.xz')) return 'archive'
  if (name.endsWith('.exe')) return 'portable'
  return 'unsupported'
}

function assetKindKey(kind: AssetKind) {
  switch (kind) {
    case 'portable':  return 'release.assetTypePortable'
    case 'installer': return 'release.assetTypeInstaller'
    case 'archive':   return 'release.assetTypeArchive'
    case 'unsupported': return 'release.assetTypeUnsupported'
  }
}

function compareVersionTags(left: string, right: string) {
  const leftParts = left.replace(/^v/i, '').split('.').map((part) => Number.parseInt(part, 10) || 0)
  const rightParts = right.replace(/^v/i, '').split('.').map((part) => Number.parseInt(part, 10) || 0)
  const length = Math.max(leftParts.length, rightParts.length)

  for (let index = 0; index < length; index += 1) {
    const diff = (leftParts[index] ?? 0) - (rightParts[index] ?? 0)
    if (diff !== 0) return diff
  }

  return 0
}

function releaseStatusKey(release: GitHubRelease, latestTag: string | null, currentVersion?: string) {
  if (currentVersion && release.tag_name === currentVersion) return 'release.statusCurrent'
  if (release.prerelease) return 'release.statusPrerelease'
  if (latestTag && release.tag_name === latestTag) return 'release.statusLatest'
  if (currentVersion && compareVersionTags(release.tag_name, currentVersion) < 0) return 'release.statusOlder'
  return 'release.statusVersion'
}

function pickBestAsset(
  assets: GitHubAsset[],
  strategy: 'portableFirst' | 'installerFirst' | 'manual' = 'portableFirst',
): GitHubAsset | null {
  if (strategy === 'manual') return assets[0] ?? null

  const platform = navigator.platform.toLowerCase()
  const isWin = platform.includes('win')
  const winExt = strategy === 'installerFirst'
    ? ['.exe', '.msi', '.zip']
    : ['.zip', '.exe', '.msi']
  const linExt = ['.appimage', '.deb', '.tar.gz', '.tar.xz']
  const preferred = isWin ? winExt : linExt

  for (const ext of preferred) {
    const match = assets.find((asset) =>
      asset.name.toLowerCase().endsWith(ext),
    )
    if (match) return match
  }

  return assets[0] ?? null
}

function ReleaseSelector({
  owner,
  repo,
  displayName,
  description,
  currentVersion,
  onClose,
  onInstalled,
}: ReleaseSelectorProps) {
  const { language, t } = useI18n()
  const { releases, loading, error, fetchReleases } = useReleases(owner, repo)
  const { downloads, download, cancel } = useDownload()
  const { settings } = useSettings()
  const [selectedRelease, setSelectedRelease] = useState<GitHubRelease | null>(null)
  const [selectedAsset, setSelectedAsset] = useState<GitHubAsset | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const reportedCompletedDownloads = useRef<Set<string>>(new Set())

  const visibleReleases = useMemo(
    () => releases.filter((release) =>
      settings.includePrereleases ? !release.draft : !release.draft && !release.prerelease,
    ),
    [releases, settings.includePrereleases],
  )

  const recommendedAsset = useMemo(
    () => selectedRelease
      ? pickBestAsset(selectedRelease.assets, settings.assetStrategy)
      : null,
    [selectedRelease, settings.assetStrategy],
  )

  const selectedAssetKind = selectedAsset ? getAssetKind(selectedAsset) : null
  const selectedAssetSupported = selectedAssetKind !== 'unsupported'

  const latestStableTag = useMemo(() => {
    const latest = visibleReleases.find((release) => !release.draft && !release.prerelease)
    return latest?.tag_name ?? visibleReleases[0]?.tag_name ?? null
  }, [visibleReleases])

  const strategyDescription = (() => {
    if (settings.assetStrategy === 'installerFirst') return t('release.strategyInstallerFirst')
    if (settings.assetStrategy === 'manual') return t('release.strategyManual')
    return t('release.strategyPortableFirst')
  })()

  const downloadLabel = (() => {
    if (!selectedAssetKind) return t('release.downloadFile')
    if (selectedAssetKind === 'installer') return t('release.runInstaller')
    if (selectedAssetKind === 'portable' || selectedAssetKind === 'archive') {
      return t('release.installPortable')
    }
    if (selectedAssetKind === 'unsupported') return t('release.unsupportedAction')
    return t('release.downloadFile')
  })()

  useEffect(() => {
    fetchReleases(true)
  }, [fetchReleases])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !downloading) {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [downloading, onClose])

  useEffect(() => {
    if (visibleReleases.length > 0 && !selectedRelease) {
      const first = visibleReleases[0]
      setSelectedRelease(first)
      setSelectedAsset(pickBestAsset(first.assets, settings.assetStrategy))
    }
  }, [selectedRelease, settings.assetStrategy, visibleReleases])

  useEffect(() => {
    downloads.forEach((downloadItem) => {
      if (
        downloadItem.status === 'completed' &&
        !reportedCompletedDownloads.current.has(downloadItem.id)
      ) {
        reportedCompletedDownloads.current.add(downloadItem.id)
        onInstalled?.()
      }
    })
  }, [downloads, onInstalled])

  const handleReleaseChange = (release: GitHubRelease) => {
    setSelectedRelease(release)
    setSelectedAsset(pickBestAsset(release.assets, settings.assetStrategy))
  }

  const handleDownload = async () => {
    if (!selectedAsset || !selectedRelease) return
    setDownloading(true)
    setDownloadError(null)
    try {
      await download(
        selectedAsset.browser_download_url,
        selectedAsset.name,
        owner,
        repo,
        selectedRelease.tag_name,
      )
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : t('release.downloadFailed'))
    } finally {
      setDownloading(false)
    }
  }

  const selectedReleaseDate = selectedRelease?.published_at
    ? new Date(selectedRelease.published_at).toLocaleDateString(language === 'en' ? 'en-US' : 'uk-UA')
    : t('about.noDate')
  const selectedReleaseStatus = selectedRelease
    ? t(releaseStatusKey(selectedRelease, latestStableTag, currentVersion))
    : null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content release-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="release-selector-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h2 id="release-selector-title">{displayName}</h2>
            <div className="release-modal-meta">
              <span>{t('release.repository', { owner, repo })}</span>
              {currentVersion && (
                <span>{t('release.currentInstalled', { version: currentVersion })}</span>
              )}
            </div>
            {description && <p className="modal-subtitle">{description}</p>}
          </div>
          <button
            type="button"
            className="close-btn"
            onClick={onClose}
            aria-label={t('release.close')}
          >
            {'\u00d7'}
          </button>
        </div>

        <div className="release-body">
          {loading && <StatePanel kind="loading" title={t('release.loading')} skeletonCount={3} />}
          {!loading && error && (
            <StatePanel
              kind="error"
              title={t('state.releaseErrorTitle')}
              message={t('state.releaseErrorText')}
              details={error}
              detailsLabel={t('state.details')}
              actionLabel={t('about.retry')}
              onAction={() => fetchReleases(true)}
            />
          )}

          {!loading && !error && visibleReleases.length === 0 && (
            <StatePanel
              kind="empty"
              title={t('release.noReleases')}
              message={t('state.releaseEmptyText')}
            />
          )}

          {!loading && !error && visibleReleases.length > 0 && (
            <>
              <div className="release-picker">
                <span className="release-section-label">{t('release.version')}</span>
                <div className="release-version-list">
                  {visibleReleases.map((release) => {
                    const isSelected = selectedRelease?.id === release.id
                    const releaseDate = release.published_at
                      ? new Date(release.published_at).toLocaleDateString(language === 'en' ? 'en-US' : 'uk-UA')
                      : t('about.noDate')

                    return (
                      <button
                        key={release.id}
                        type="button"
                        className={`release-version-card ${isSelected ? 'active' : ''}`}
                        onClick={() => handleReleaseChange(release)}
                        aria-pressed={isSelected}
                      >
                        <span className="release-version-main">
                          <strong>{release.tag_name}</strong>
                          <span>{releaseDate}</span>
                        </span>
                        <span className={`release-status-pill ${release.prerelease ? 'prerelease' : ''}`}>
                          {t(releaseStatusKey(release, latestStableTag, currentVersion))}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {selectedRelease && (
                <div className="release-selection-summary">
                  <span className="release-summary-kicker">{t('release.selectedVersion')}</span>
                  <div className="release-summary-main">
                    <strong>{selectedRelease.tag_name}</strong>
                    {selectedReleaseStatus && (
                      <span className={`release-status-pill ${selectedRelease.prerelease ? 'prerelease' : ''}`}>
                        {selectedReleaseStatus}
                      </span>
                    )}
                  </div>
                  <p>{selectedReleaseDate}</p>
                  <span className="release-summary-assets">
                    {t('release.filesCount', { count: selectedRelease.assets.length })}
                  </span>
                </div>
              )}

              {selectedRelease && selectedRelease.assets.length > 0 && (
                <div className="release-picker">
                  <span className="release-section-label">{t('release.file')}</span>
                  <p className="release-strategy-note">{strategyDescription}</p>
                  <div className="release-asset-list">
                    {selectedRelease.assets.map((asset) => {
                      const kind = getAssetKind(asset)
                      const isSelected = selectedAsset?.id === asset.id
                      const isSupported = kind !== 'unsupported'

                      return (
                        <button
                          key={asset.id}
                          type="button"
                          className={`release-asset-card release-asset-card--${kind} ${isSelected ? 'active' : ''}`}
                          onClick={() => setSelectedAsset(asset)}
                          disabled={!isSupported}
                          aria-pressed={isSelected}
                        >
                          <span className="release-asset-main">
                            <strong>{asset.name}</strong>
                            <span>{formatBytes(asset.size)}</span>
                          </span>
                          <span className="release-asset-badges">
                            <span className="asset-kind">{t(assetKindKey(kind))}</span>
                            {recommendedAsset?.id === asset.id && isSupported && (
                              <span className="asset-recommended">{t('release.recommended')}</span>
                            )}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {selectedAsset && (
                <div className={`asset-summary asset-summary--${selectedAssetKind}`}>
                  <div>
                    <span className="asset-kind">
                      {selectedAssetKind ? t(assetKindKey(selectedAssetKind)) : t('release.assetTypeUnsupported')}
                    </span>
                    {recommendedAsset?.id === selectedAsset.id && (
                      <span className="asset-recommended">{t('release.recommended')}</span>
                    )}
                  </div>
                  <span>{selectedAsset.name}</span>
                  {selectedAssetKind === 'installer' && (
                    <p>{t('release.installerWarning')}</p>
                  )}
                  {selectedAssetKind === 'unsupported' && (
                    <p>{t('release.unsupportedWarning')}</p>
                  )}
                  {selectedAssetKind !== 'unsupported' && (
                    <p>{t('release.installSummary', { version: selectedRelease?.tag_name ?? '', file: selectedAsset.name })}</p>
                  )}
                </div>
              )}

              {selectedRelease && selectedRelease.assets.length === 0 && (
                <p className="no-assets">
                  {t('release.noAssets')}
                </p>
              )}

              {downloadError && (
                <div className="error-message">{downloadError}</div>
              )}

              <div className="release-actions">
                <button
                  onClick={handleDownload}
                  disabled={!selectedAsset || !selectedAssetSupported || downloading}
                  className="download-btn release-action-primary"
                >
                  {downloading
                    ? t('release.starting')
                    : selectedAsset
                      ? downloadLabel
                      : t('release.download', { name: '' })}
                </button>
                <a
                  href={`https://github.com/${owner}/${repo}/releases/tag/${selectedRelease?.tag_name}`}
                  target="_blank"
                  rel="noreferrer"
                  className="view-release-link release-github-link"
                >
                  GitHub
                </a>
              </div>
            </>
          )}

          <DownloadProgressPanel downloads={downloads} onCancel={cancel} />
        </div>
      </div>
    </div>
  )
}

export default ReleaseSelector
