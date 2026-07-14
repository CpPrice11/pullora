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

export interface GitHubQueueStatus {
  active: number
  queued: number
  concurrency: number
  highPriority: number
  normalPriority: number
  pausedUntil: number | null
}

// App settings — matches Rust AppSettings (Tauri returns snake_case by default, but serde renames to camelCase via Tauri)
export interface AppSettings {
  version?: number
  installationPath: string
  includePrereleases?: boolean
  assetStrategy?: 'portableFirst' | 'installerFirst' | 'manual'
  githubOwner?: string
  githubToken?: string | null
  theme: 'light' | 'dark' | 'auto'
  language: string
  appearance?: AppAppearanceSettings
}

export interface AppAppearanceSettings {
  preset: 'github' | 'githubLight' | 'midnight' | 'custom'
  accent: string
  accentHover: string
  background: string
  surface: string
  surface2: string
  sidebar: string
  text: string
  muted: string
  border: string
  fontFamily: string
  fontSize: number
  radius: number
  density: 'compact' | 'comfortable' | 'spacious'
  customCss: string
}

export interface InstallPathValidation {
  ok: boolean
  status: 'ok' | 'missing' | 'inaccessible' | 'noWritePermission' | 'requiresElevation'
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
}

export interface LibraryFolder {
  id: string
  name: string
  repoKeys: string[]
  pinned?: boolean
}

export interface ProjectArt {
  owner: string
  repo: string
  coverPath?: string | null
  backgroundPath?: string | null
  coverDataUrl?: string | null
  backgroundDataUrl?: string | null
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
  | 'runningInstaller'
  | 'detectingExecutable'
  | 'registering'
  | 'completed'
  | 'failed'

export interface DownloadProgress {
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
}
