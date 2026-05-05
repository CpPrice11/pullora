import { useEffect, useState } from 'react'
import { useReleases } from '../../hooks/useGitHub'
import type { GitHubRelease, GitHubAsset } from '../../types'
import './SearchComponents.css'
import '../Modal/Modal.css'

interface ReleaseSelectorProps {
  owner: string
  repo: string
  displayName: string
  description?: string
  onClose: () => void
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function pickBestAsset(assets: GitHubAsset[]): GitHubAsset | null {
  // Prefer Windows exe/zip/msi on Windows, linux deb/AppImage/tar.gz on Linux
  const platform = navigator.platform.toLowerCase()
  const isWin = platform.includes('win')

  const winExt = ['.exe', '.msi', '.zip']
  const linExt = ['.appimage', '.deb', '.tar.gz', '.tar.xz']

  const preferred = isWin ? winExt : linExt
  for (const ext of preferred) {
    const match = assets.find((a) => a.name.toLowerCase().endsWith(ext))
    if (match) return match
  }
  return assets[0] ?? null
}

function ReleaseSelector({ owner, repo, displayName, description, onClose }: ReleaseSelectorProps) {
  const { releases, loading, error, fetchReleases } = useReleases(owner, repo)
  const [selectedRelease, setSelectedRelease] = useState<GitHubRelease | null>(null)
  const [selectedAsset, setSelectedAsset] = useState<GitHubAsset | null>(null)

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

  const handleReleaseChange = (release: GitHubRelease) => {
    setSelectedRelease(release)
    setSelectedAsset(pickBestAsset(release.assets))
  }

  const handleDownload = () => {
    if (!selectedAsset) return
    // TODO: Phase 3 — wire up Tauri download command
    alert(`Download will be implemented in Phase 3!\n\nFile: ${selectedAsset.name}\nURL: ${selectedAsset.browser_download_url}`)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content release-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>{displayName}</h2>
            {description && <p className="modal-subtitle">{description}</p>}
          </div>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="release-body">
          {loading && <p className="loading-text">Loading releases...</p>}

          {error && (
            <div className="error-message">{error}</div>
          )}

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
                    const rel = releases.find((r) => r.id === Number(e.target.value))
                    if (rel) handleReleaseChange(rel)
                  }}
                >
                  {releases.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.tag_name}
                      {r.prerelease ? ' (pre-release)' : ''}
                      {r.draft ? ' (draft)' : ''}
                      {r.published_at
                        ? ` — ${new Date(r.published_at).toLocaleDateString()}`
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
                        (a) => a.id === Number(e.target.value),
                      )
                      if (asset) setSelectedAsset(asset)
                    }}
                  >
                    {selectedRelease.assets.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({formatBytes(a.size)})
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

              <div className="release-actions">
                <button
                  onClick={handleDownload}
                  disabled={!selectedAsset}
                  className="download-btn"
                >
                  ⬇ Download {selectedAsset?.name ?? ''}
                </button>
                <a
                  href={`https://github.com/${owner}/${repo}/releases/tag/${selectedRelease?.tag_name}`}
                  target="_blank"
                  rel="noreferrer"
                  className="view-release-link"
                >
                  View on GitHub ↗
                </a>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default ReleaseSelector
