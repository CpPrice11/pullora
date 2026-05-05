export interface AppSettings {
  installationPath: string
  autoUpdateCheck: boolean
  checkIntervalHours: number
  githubToken?: string
  theme: 'light' | 'dark' | 'auto'
  language: string
}

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
}

export interface GitHubRelease {
  id: number
  tag_name: string
  name: string | null
  draft: boolean
  prerelease: boolean
  published_at: string
  assets: GitHubAsset[]
}

export interface GitHubAsset {
  id: number
  name: string
  browser_download_url: string
  size: number
  content_type: string
}

export interface InstalledApp {
  name: string
  owner: string
  repo: string
  versions: VersionInfo[]
  activeVersion: string
  isFavorite: boolean
}

export interface VersionInfo {
  tag: string
  installedAt: string
  executable: string
  sizeBytes: number
}

export interface FavoriteApp {
  owner: string
  repo: string
  displayName: string
  description?: string
  lastChecked?: string
}

export interface DownloadProgress {
  id: string
  fileName: string
  progress: number
  totalSize: number
  downloadedSize: number
  status: 'downloading' | 'extracting' | 'completed' | 'failed'
  error?: string
}

export interface UpdateAvailable {
  appName: string
  currentVersion: string
  latestVersion: string
  releaseUrl: string
}
