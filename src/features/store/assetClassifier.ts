import type { GitHubAsset, GitHubRelease } from '../../types'

export type ReleaseAssetKind = 'portable' | 'installer' | 'archive' | 'unsupported'
export type ReleaseAssetPlatform = 'windows' | 'macos' | 'linux' | 'android' | 'ios' | 'unknown'
export type ReleaseAssetArchitecture = 'x64' | 'arm64' | 'x86' | 'arm' | 'universal' | 'unknown'

export interface ReleaseRuntime {
  platform: ReleaseAssetPlatform | 'other' | null
  architecture: ReleaseAssetArchitecture
}

export interface ReleaseAssetCompatibility {
  kind: ReleaseAssetKind
  platform: ReleaseAssetPlatform
  architecture: ReleaseAssetArchitecture
  compatible: boolean
}

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

const platformNameMatchers: Array<[ReleaseAssetPlatform, RegExp]> = [
  ['windows', /(^|[^a-z0-9])(windows|win32|win64|win)([^a-z0-9]|$)/i],
  ['macos', /(^|[^a-z0-9])(mac|macos|mac-os|osx|darwin)([^a-z0-9]|$)/i],
  ['linux', /(^|[^a-z0-9])(linux|ubuntu|debian)([^a-z0-9]|$)/i],
  ['android', /(^|[^a-z0-9])android([^a-z0-9]|$)/i],
  ['ios', /(^|[^a-z0-9])ios([^a-z0-9]|$)/i],
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

  if (name.includes('portable') || name.endsWith('.appimage')) {
    return 'portable'
  }

  if (archiveExtensions.some((extension) => name.endsWith(extension))) {
    return 'archive'
  }

  if (name.endsWith('.exe')) return 'portable'

  return 'unsupported'
}

export function classifyReleaseAssetPlatform(asset: GitHubAsset): ReleaseAssetPlatform {
  const name = asset.name.trim().toLowerCase()
  for (const [platform, matcher] of platformNameMatchers) {
    if (matcher.test(name)) return platform
  }
  if (/\.(exe|msi)$/i.test(name)) return 'windows'
  if (/\.(dmg|pkg)$/i.test(name)) return 'macos'
  if (/\.(appimage|deb|rpm)$/i.test(name)) return 'linux'
  if (/\.(apk|aab)$/i.test(name)) return 'android'
  if (/\.ipa$/i.test(name)) return 'ios'
  return 'unknown'
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
  runtime?: ReleaseRuntime,
): ReleaseAssetCompatibility {
  const kind = classifyReleaseAsset(asset)
  const platform = classifyReleaseAssetPlatform(asset)
  const architecture = classifyReleaseAssetArchitecture(asset)
  const platformCompatible = !runtime?.platform
    || runtime.platform === 'other'
    || platform === 'unknown'
    || platform === runtime.platform
  const architectureCompatible = !runtime
    || runtime.architecture === 'unknown'
    || architecture === 'unknown'
    || architecture === 'universal'
    || architecture === runtime.architecture

  return {
    kind,
    platform,
    architecture,
    compatible: kind !== 'unsupported' && platformCompatible && architectureCompatible,
  }
}

export function isInstallableReleaseAsset(asset: GitHubAsset, runtime?: ReleaseRuntime) {
  return classifyReleaseAssetCompatibility(asset, runtime).compatible
}

export function installableAssetsForRelease(release: GitHubRelease, runtime?: ReleaseRuntime) {
  return release.assets.filter((asset) => isInstallableReleaseAsset(asset, runtime))
}

export function hasInstallableReleaseAsset(release: GitHubRelease, runtime?: ReleaseRuntime) {
  return installableAssetsForRelease(release, runtime).length > 0
}

export function releaseAssetKindLabelKey(kind: ReleaseAssetKind) {
  switch (kind) {
    case 'portable': return 'release.assetTypePortable'
    case 'installer': return 'release.assetTypeInstaller'
    case 'archive': return 'release.assetTypeArchive'
    case 'unsupported': return 'release.assetTypeUnsupported'
  }
}

export function releaseAssetPlatformLabelKey(platform: ReleaseAssetPlatform) {
  return `store.platform.${platform}`
}

export function releaseAssetArchitectureLabelKey(architecture: ReleaseAssetArchitecture) {
  return `store.architecture.${architecture}`
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
