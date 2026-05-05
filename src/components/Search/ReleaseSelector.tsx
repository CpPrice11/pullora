import { useEffect, useRef, useState } from 'react'
import { useReleases } from '../../hooks/useGitHub'
import { useDownload } from '../../hooks/useDownload'
import type { GitHubRelease, GitHubAsset } from '../../types'
import DownloadProgressPanel from '../Install/DownloadProgress'
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

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function pickBestAsset(assets: GitHubAsset[]): GitHubAsset | null {
  const platform = navigator.platform.toLowerCase()
  const isWin = platform.includes('win')
  const winExt = ['.zip', '.exe', '.msi']
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
  const { releases, loading, error, fetchReleases } = useReleases(owner, repo)
  const { downloads, download, cancel } = useDownload()
  const [selectedRelease, setSelectedRelease] = useState<GitHubRelease | null>(null)
  const [selectedAsset, setSelectedAsset] = useState<GitHubAsset | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const reportedCompletedDownloads = useRef<Set<string>>(new Set())

  useEffect(() => {
    fetchReleases()
  }, [fetchReleases])

  useEffect(() => {
    if (releases.length > 0 && !selectedRelease) {
      const first = releases[0]
      setSelectedRelease(first)
      setSelectedAsset(pickBestAsset(first.assets))
    }
  }, [releases, selectedRelease])

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
    setSelectedAsset(pickBestAsset(release.assets))
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
      setDownloadError(err instanceof Error ? err.message : 'Download failed')
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
            Close
          </button>
        </div>

        <div className="release-body">
          {loading && <p className="loading-text">Loading releases...</p>}
          {error && <div className="error-message">{error}</div>}

          {!loading && releases.length === 0 && (
            <p className="no-releases">No releases found for this repository.</p>
          )}

          {releases.length > 0 && (
            <>
              <div className="form-group">
                <label htmlFor="release-select">Version</label>
                <select
                  id="release-select"
                  value={selectedRelease?.id ?? ''}
                  onChange={(e) => {
                    const release = releases.find((item) => item.id === Number(e.target.value))
                    if (release) handleReleaseChange(release)
                  }}
                >
                  {releases.map((release) => (
                    <option key={release.id} value={release.id}>
                      {release.tag_name}
                      {release.prerelease ? ' (pre-release)' : ''}
                      {release.draft ? ' (draft)' : ''}
                      {release.published_at
                        ? ` - ${new Date(release.published_at).toLocaleDateString()}`
                        : ''}
                    </option>
                  ))}
                </select>
              </div>

              {selectedRelease && selectedRelease.assets.length > 0 && (
                <div className="form-group">
                  <label htmlFor="asset-select">File</label>
                  <select
                    id="asset-select"
                    value={selectedAsset?.id ?? ''}
                    onChange={(e) => {
                      const asset = selectedRelease.assets.find(
                        (item) => item.id === Number(e.target.value),
                      )
                      if (asset) setSelectedAsset(asset)
                    }}
                  >
                    {selectedRelease.assets.map((asset) => (
                      <option key={asset.id} value={asset.id}>
                        {asset.name} ({formatBytes(asset.size)})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {selectedRelease && selectedRelease.assets.length === 0 && (
                <p className="no-assets">
                  This release has no binary assets. Only source code is available.
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
                  {downloading ? 'Starting...' : `Download ${selectedAsset?.name ?? ''}`}
                </button>
                <a
                  href={`https://github.com/${owner}/${repo}/releases/tag/${selectedRelease?.tag_name}`}
                  target="_blank"
                  rel="noreferrer"
                  className="view-release-link"
                >
                  View on GitHub
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
