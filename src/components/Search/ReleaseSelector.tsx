import { useEffect, useMemo, useRef, useState } from 'react'
import { useReleases } from '../../hooks/useGitHub'
import { useDownload } from '../../hooks/useDownload'
import { useSettings } from '../../hooks/useSettings'
import type { GitHubRelease, GitHubAsset } from '../../types'
import DownloadProgressPanel from '../Install/DownloadProgress'
import { useI18n } from '../../i18n'
import './SearchComponents.css'
import '../Modal/Modal.css'

interface ReleaseSelectorProps {
  owner: string
  repo: string
  displayName: string
  description?: string
  onClose: () => void
  onInstalled?: () => void
}

type AssetKind = 'portable' | 'installer' | 'archive' | 'unknown'

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
  return 'unknown'
}

function assetKindKey(kind: AssetKind) {
  switch (kind) {
    case 'portable':  return 'release.assetTypePortable'
    case 'installer': return 'release.assetTypeInstaller'
    case 'archive':   return 'release.assetTypeArchive'
    case 'unknown':   return 'release.assetTypeUnknown'
  }
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
    return t('release.downloadFile')
  })()

  useEffect(() => {
    fetchReleases()
  }, [fetchReleases])

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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content release-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>{displayName}</h2>
            {description && <p className="modal-subtitle">{description}</p>}
          </div>
          <button className="close-btn" onClick={onClose}>
            {t('release.close')}
          </button>
        </div>

        <div className="release-body">
          {loading && <p className="loading-text">{t('release.loading')}</p>}
          {error && <div className="error-message">{error}</div>}

          {!loading && visibleReleases.length === 0 && (
            <p className="no-releases">
              {t('release.noReleases')}
            </p>
          )}

          {visibleReleases.length > 0 && (
            <>
              <div className="form-group">
                <label htmlFor="release-select">{t('release.version')}</label>
                <select
                  id="release-select"
                  value={selectedRelease?.id ?? ''}
                  onChange={(event) => {
                    const release = visibleReleases.find((item) => item.id === Number(event.target.value))
                    if (release) handleReleaseChange(release)
                  }}
                >
                  {visibleReleases.map((release) => (
                    <option key={release.id} value={release.id}>
                      {release.tag_name}
                      {release.prerelease ? ' (prerelease)' : ''}
                      {release.published_at
                        ? ` - ${new Date(release.published_at).toLocaleDateString(language === 'en' ? 'en-US' : 'uk-UA')}`
                        : ''}
                    </option>
                  ))}
                </select>
              </div>

              {selectedRelease && selectedRelease.assets.length > 0 && (
                <div className="form-group">
                  <label htmlFor="asset-select">{t('release.file')}</label>
                  <p className="release-strategy-note">{strategyDescription}</p>
                  <select
                    id="asset-select"
                    value={selectedAsset?.id ?? ''}
                    onChange={(event) => {
                      const asset = selectedRelease.assets.find(
                        (item) => item.id === Number(event.target.value),
                      )
                      if (asset) setSelectedAsset(asset)
                    }}
                  >
                    {selectedRelease.assets.map((asset) => (
                      <option key={asset.id} value={asset.id}>
                        {asset.name} ({t(assetKindKey(getAssetKind(asset)))}, {formatBytes(asset.size)})
                        {recommendedAsset?.id === asset.id ? ` - ${t('release.recommended')}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {selectedAsset && (
                <div className={`asset-summary asset-summary--${selectedAssetKind}`}>
                  <div>
                    <span className="asset-kind">
                      {selectedAssetKind ? t(assetKindKey(selectedAssetKind)) : t('release.assetTypeUnknown')}
                    </span>
                    {recommendedAsset?.id === selectedAsset.id && (
                      <span className="asset-recommended">{t('release.recommended')}</span>
                    )}
                  </div>
                  <span>{selectedAsset.name}</span>
                  {selectedAssetKind === 'installer' && (
                    <p>{t('release.installerWarning')}</p>
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
                  disabled={!selectedAsset || downloading}
                  className="download-btn"
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
                  className="view-release-link"
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
