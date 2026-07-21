import type { GitHubAsset } from '../../types'

export type ReleaseAssetKind = 'portable' | 'installer' | 'archive' | 'unsupported'
export type ReleaseAssetArchitecture = 'x64' | 'arm64' | 'x86' | 'arm' | 'universal' | 'unknown'

export interface ReleaseAssetCompatibility {
  kind: ReleaseAssetKind
  architecture: ReleaseAssetArchitecture
  compatible: boolean
}

const sourceArchiveNames = [
  'source code',
  'source-code',
  'source_code',
]

const architectureMatchers: Array<[ReleaseAssetArchitecture, RegExp]> = [
  ['arm64', /(^|[^a-z0-9])(arm64|aarch64)([^a-z0-9]|$)/i],
  ['x64', /(^|[^a-z0-9])(x64|x86[-_]?64|amd64)([^a-z0-9]|$)/i],
  ['x86', /(^|[^a-z0-9])(x86|ia32|i[3-6]86)([^a-z0-9]|$)/i],
  ['arm', /(^|[^a-z0-9])(armv7|armhf|arm32)([^a-z0-9]|$)/i],
  ['universal', /(^|[^a-z0-9])(universal|noarch|anycpu|all)([^a-z0-9]|$)/i],
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

  if (name.includes('portable')) {
    return 'portable'
  }

  if (name.endsWith('.zip')) {
    return 'archive'
  }

  if (name.endsWith('.exe')) return 'portable'

  return 'unsupported'
}

export function classifyReleaseAssetArchitecture(asset: GitHubAsset): ReleaseAssetArchitecture {
  const name = asset.name.trim().toLowerCase()
  for (const [architecture, matcher] of architectureMatchers) {
    if (matcher.test(name)) return architecture
  }
  return 'unknown'
}

export function classifyReleaseAssetCompatibility(
  asset: GitHubAsset,
): ReleaseAssetCompatibility {
  const kind = classifyReleaseAsset(asset)
  const architecture = classifyReleaseAssetArchitecture(asset)

  return {
    kind,
    architecture,
    compatible: kind !== 'unsupported',
  }
}

export function isInstallableReleaseAsset(asset: GitHubAsset) {
  return classifyReleaseAssetCompatibility(asset).compatible
}

export function releaseAssetKindLabelKey(kind: ReleaseAssetKind) {
  switch (kind) {
    case 'portable': return 'release.assetTypePortable'
    case 'installer': return 'release.assetTypeInstaller'
    case 'archive': return 'release.assetTypeArchive'
    case 'unsupported': return 'release.assetTypeUnsupported'
  }
}
