// GitHub API types (match Rust struct field names from Tauri commands)
export interface GitHubSearchResult {
  id: number
  name: string
  full_name: string
  owner: {
    login: string
    avatar_url: string
  }
  description: string | null
  stargazers_count: number
  updated_at: string
  html_url: string
  homepage?: string | null
  website_url?: string | null
  language: string | null
  topics: string[] | null
  has_releases: boolean
  fork: boolean
  archived: boolean
  private: boolean
}

export interface OwnerRepositoriesResponse {
  items: GitHubSearchResult[]
  page: number
  has_more: boolean
}

export interface GitHubRelease {
  id: number
  tag_name: string
  name: string | null
  html_url?: string | null
  draft: boolean
  prerelease: boolean
  published_at: string | null
  body: string | null
  assets: GitHubAsset[]
}

export interface GitHubAsset {
  id: number
  name: string
  browser_download_url: string
  size: number
  content_type: string
  download_count: number
  digest?: string | null
}

export interface GitHubRateLimitBucket {
  remaining: number | null
  limit: number | null
  resetAt: number | null
}

export interface GitHubRateLimitStatus {
  core: GitHubRateLimitBucket
  search: GitHubRateLimitBucket
}

// App settings — matches Rust AppSettings (Tauri returns snake_case by default, but serde renames to camelCase via Tauri)
export interface AppSettings {
  version?: number
  installationPath: string
  githubToken?: string | null
  updateNotifications?: boolean
  theme: 'light' | 'dark' | 'auto'
  language: string
  appearance?: AppAppearanceSettings
}

export type EffectsLevel = 'off' | 'balanced' | 'high'

export interface AppAppearanceSettings {
  density: 'compact' | 'comfortable' | 'spacious'
  effectsLevel: EffectsLevel
  surfaceTransparency: number
  surfaceBlur: number
}

export interface InstallPathValidation {
  ok: boolean
  status: 'ok' | 'elevationRequired' | 'missing' | 'unsafe' | 'inaccessible' | 'noWritePermission' | 'busy'
}

// Installed app types
export interface VersionInfo {
  tag: string
  installedAt: string
  executable: string
  sizeBytes: number
  assetName?: string | null
  installKind?: string | null
  installDir?: string | null
}

export interface InstalledApp {
  name: string
  owner: string
  repo: string
  versions: VersionInfo[]
  activeVersion: string
  lastLaunchedAt?: string | null
}

export interface AppRuntimeState {
  owner: string
  repo: string
  running: boolean
  uncertain: boolean
}

export interface DetectedInstallation {
  owner: string
  repo: string
  version: string
  executablePath: string
  installDir: string
}

export type InstallationStatus = 'ready' | 'missing' | 'unavailable'
export interface InstallationSnapshot {
  installedApps: InstalledApp[]
  discoveredApps: DetectedInstallation[]
  health: { owner: string; repo: string; status: InstallationStatus }[]
}
export interface InstallationPlan {
  allowedAssetNames: string[]
  recommendedAssetName: string | null
  requiredFormat: 'portable' | 'archive' | 'installer' | null
}

export interface InstalledAppHealth {
  ok: boolean
  status: 'ready' | 'missingExecutable' | 'needsRepair'
  executablePath?: string | null
}

// Favorites
export interface FavoriteApp {
  owner: string
  repo: string
  displayName: string
  description?: string
  lastChecked?: string
  websiteUrl?: string | null
}

export interface LibraryFolder {
  id: string
  name: string
  repoKeys: string[]
  pinned?: boolean
}

export interface ArtCrop {
  focusX: number
  focusY: number
  zoom: number
}

export interface ProjectArt {
  owner: string
  repo: string
  coverPath?: string | null
  backgroundPath?: string | null
  coverDataUrl?: string | null
  backgroundDataUrl?: string | null
  coverCrop: ArtCrop
  backgroundCrop: ArtCrop
  updatedAt: string
}

export interface LauncherStorageInfo {
  launcherDir: string
  updateCachePath: string
  backupPath: string
  cleanupBytes: number
  updateCacheCount: number
  backupCount: number
}

// Download progress
export type DownloadStage =
  | 'queued'
  | 'downloading'
  | 'verifying'
  | 'extracting'
  | 'installing'
  | 'launchChecking'
  | 'completed'
  | 'failed'

export interface DownloadProgress {
  paused?: boolean
  checksumStatus?: 'pending' | 'verified' | 'unavailable' | 'failed' | null
  id: string
  fileName: string
  progress: number
  totalSize: number
  downloadedSize: number
  status: 'pending' | 'downloading' | 'extracting' | 'completed' | 'failed'
  stage: DownloadStage
  owner?: string
  repo?: string
  tag?: string
  installPath?: string
  executablePath?: string
  error?: string
  sourceUrl?: string
}

export type LauncherInstallationMode = 'portable' | 'installed'
