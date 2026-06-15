import type { GitHubAsset, GitHubRelease } from '../../types'

export type ReleaseAssetKind = 'portable' | 'installer' | 'archive' | 'unsupported'

const archiveExtensions = [
  '.zip',
  '.tar.gz',
  '.tgz',
  '.tar.xz',
  '.tar.bz2',
]

const sourceArchiveNames = [
  'source code',
  'source-code',
  'source_code',
]

export function classifyReleaseAsset(asset: GitHubAsset): ReleaseAssetKind {
  const name = asset.name.trim().toLowerCase()
  if (!name) return 'unsupported'

  if (sourceArchiveNames.some((sourceName) => name.includes(sourceName))) {
    return 'unsupported'
  }

  const isInstaller =
    name.includes('setup') ||
    name.includes('installer') ||
    name.endsWith('.msi')

  if (isInstaller) return 'installer'

  if (name.includes('portable') || name.endsWith('.appimage')) {
    return 'portable'
  }

  if (archiveExtensions.some((extension) => name.endsWith(extension))) {
    return 'archive'
  }

  if (name.endsWith('.exe')) return 'portable'

  return 'unsupported'
}

export function isInstallableReleaseAsset(asset: GitHubAsset) {
  return classifyReleaseAsset(asset) !== 'unsupported'
}

export function installableAssetsForRelease(release: GitHubRelease) {
  return release.assets.filter(isInstallableReleaseAsset)
}

export function hasInstallableReleaseAsset(release: GitHubRelease) {
  return installableAssetsForRelease(release).length > 0
}

export function releaseAssetKindLabelKey(kind: ReleaseAssetKind) {
  switch (kind) {
    case 'portable': return 'release.assetTypePortable'
    case 'installer': return 'release.assetTypeInstaller'
    case 'archive': return 'release.assetTypeArchive'
    case 'unsupported': return 'release.assetTypeUnsupported'
  }
}

interface ReleaseAssetKindStatus {
  checked?: boolean
  checking?: boolean
  installable?: boolean
  assetKinds?: ReleaseAssetKind[]
  source?: 'release' | 'cache' | 'degraded'
}

export function releaseAssetKindsForStatus(status?: ReleaseAssetKindStatus): ReleaseAssetKind[] {
  const kinds = status?.assetKinds ?? []
  if (kinds.length > 0) {
    return [...new Set(kinds)]
  }

  if (status?.checked && !status.checking && !status.installable && status.source !== 'degraded') {
    return ['unsupported']
  }

  return []
}
