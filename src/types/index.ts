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

// App settings — matches Rust AppSettings (Tauri returns snake_case by default, but serde renames to camelCase via Tauri)
export interface AppSettings {
  installationPath: string
  autoUpdateCheck: boolean
  checkIntervalHours: number
  githubOwner?: string
  githubToken?: string
  theme: 'light' | 'dark' | 'auto'
  language: string
}

// Installed app types
export interface VersionInfo {
  tag: string
  installedAt: string
  executable: string
  sizeBytes: number
}

export interface InstalledApp {
  name: string
  owner: string
  repo: string
  versions: VersionInfo[]
  activeVersion: string
}

// Favorites
export interface FavoriteApp {
  owner: string
  repo: string
  displayName: string
  description?: string
  lastChecked?: string
}

// Update check
export interface UpdateAvailable {
  owner: string
  repo: string
  appName: string
  currentVersion: string
  latestVersion: string
  releaseUrl: string
}

// Download progress
export interface DownloadProgress {
  id: string
  fileName: string
  progress: number
  totalSize: number
  downloadedSize: number
  status: 'pending' | 'downloading' | 'extracting' | 'completed' | 'failed'
  error?: string
}
