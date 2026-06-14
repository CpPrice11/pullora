import type { GitHubSearchResult } from '../../types'

export type StoreBrowseTab = 'popular' | 'updated' | 'new' | 'releases' | 'favorites'
export type StoreInstallableFilter = 'all' | 'installable'
export type StoreSort = 'updated' | 'stars' | 'forks'
export type StorePlatform = 'windows' | 'macos' | 'linux' | 'ios' | 'android' | 'other' | null

export interface StoreQueryOptions {
  query?: string
  sort?: StoreSort
  language?: string
  topic?: string
}

export interface StoreSectionConfig {
  id: string
  titleKey: string
  subtitleKey: string
  options: StoreQueryOptions
}

export interface StoreCategory {
  id: string
  title: string
  icon: string
  estimate: string
  language?: string
  topic?: string
}

export const storeBrowseTabs: StoreBrowseTab[] = ['popular', 'updated', 'new', 'releases', 'favorites']

export const storeHomeSections: StoreSectionConfig[] = [
  {
    id: 'recommended',
    titleKey: 'store.section.recommended',
    subtitleKey: 'store.section.recommendedText',
    options: { sort: 'stars', topic: 'desktop-application' },
  },
  {
    id: 'updated',
    titleKey: 'store.section.updated',
    subtitleKey: 'store.section.updatedText',
    options: { sort: 'updated' },
  },
  {
    id: 'popular',
    titleKey: 'store.section.popular',
    subtitleKey: 'store.section.popularText',
    options: { sort: 'stars' },
  },
  {
    id: 'typescript',
    titleKey: 'store.section.typescript',
    subtitleKey: 'store.section.typescriptText',
    options: { sort: 'stars', language: 'TypeScript' },
  },
]

export const storeCategories: StoreCategory[] = [
  { id: 'javascript', title: 'JavaScript', icon: 'JS', estimate: '31.4k', language: 'JavaScript' },
  { id: 'typescript', title: 'TypeScript', icon: 'TS', estimate: '18.7k', language: 'TypeScript' },
  { id: 'rust', title: 'Rust', icon: 'RS', estimate: '7.2k', language: 'Rust' },
  { id: 'python', title: 'Python', icon: 'PY', estimate: '26.1k', language: 'Python' },
  { id: 'game', title: 'Game', icon: 'GP', estimate: '6.8k', topic: 'game' },
  { id: 'tool', title: 'Tool', icon: 'TL', estimate: '27.9k', topic: 'tool' },
  { id: 'ai', title: 'AI', icon: 'AI', estimate: '15.6k', topic: 'ai' },
  { id: 'desktop', title: 'Desktop', icon: 'PC', estimate: '9.3k', topic: 'desktop-application' },
]

export const fallbackStoreRepos: GitHubSearchResult[] = [
  {
    id: 33210074,
    name: 'freeCodeCamp',
    full_name: 'freeCodeCamp/freeCodeCamp',
    owner: {
      login: 'freeCodeCamp',
      avatar_url: 'https://avatars.githubusercontent.com/u/9892522?v=4',
    },
    description: 'freeCodeCamp.org open-source codebase and curriculum.',
    stargazers_count: 431000,
    updated_at: '2026-06-01T00:00:00Z',
    html_url: 'https://github.com/freeCodeCamp/freeCodeCamp',
    language: 'TypeScript',
    topics: ['education', 'learning', 'web', 'javascript'],
    has_releases: false,
    fork: false,
    archived: false,
    private: false,
  },
  {
    id: 63537249,
    name: 'rustdesk',
    full_name: 'rustdesk/rustdesk',
    owner: {
      login: 'rustdesk',
      avatar_url: 'https://avatars.githubusercontent.com/u/71636191?v=4',
    },
    description: 'An open-source remote desktop application designed for self-hosting.',
    stargazers_count: 98000,
    updated_at: '2026-06-01T00:00:00Z',
    html_url: 'https://github.com/rustdesk/rustdesk',
    language: 'Rust',
    topics: ['remote-desktop', 'desktop-application', 'self-hosted'],
    has_releases: true,
    fork: false,
    archived: false,
    private: false,
  },
  {
    id: 6123446,
    name: 'app',
    full_name: 'signalapp/Signal-Desktop',
    owner: {
      login: 'signalapp',
      avatar_url: 'https://avatars.githubusercontent.com/u/702459?v=4',
    },
    description: 'Signal Desktop links with Signal on Android or iOS.',
    stargazers_count: 17000,
    updated_at: '2026-06-01T00:00:00Z',
    html_url: 'https://github.com/signalapp/Signal-Desktop',
    language: 'TypeScript',
    topics: ['desktop-application', 'electron', 'messaging'],
    has_releases: true,
    fork: false,
    archived: false,
    private: false,
  },
  {
    id: 21632313,
    name: 'open-webui',
    full_name: 'open-webui/open-webui',
    owner: {
      login: 'open-webui',
      avatar_url: 'https://avatars.githubusercontent.com/u/158137808?v=4',
    },
    description: 'User-friendly AI interface for LLMs.',
    stargazers_count: 98000,
    updated_at: '2026-06-01T00:00:00Z',
    html_url: 'https://github.com/open-webui/open-webui',
    language: 'Python',
    topics: ['ai', 'llm', 'chat', 'self-hosted'],
    has_releases: true,
    fork: false,
    archived: false,
    private: false,
  },
  {
    id: 10270250,
    name: 'wails',
    full_name: 'wailsapp/wails',
    owner: {
      login: 'wailsapp',
      avatar_url: 'https://avatars.githubusercontent.com/u/34800785?v=4',
    },
    description: 'Create beautiful applications using Go.',
    stargazers_count: 35000,
    updated_at: '2026-06-01T00:00:00Z',
    html_url: 'https://github.com/wailsapp/wails',
    language: 'Go',
    topics: ['desktop-application', 'go', 'webview', 'tool'],
    has_releases: true,
    fork: false,
    archived: false,
    private: false,
  },
  {
    id: 632080211,
    name: 'DevToys',
    full_name: 'DevToys-app/DevToys',
    owner: {
      login: 'DevToys-app',
      avatar_url: 'https://avatars.githubusercontent.com/u/111682917?v=4',
    },
    description: 'A Swiss Army knife for developers.',
    stargazers_count: 32000,
    updated_at: '2026-06-01T00:00:00Z',
    html_url: 'https://github.com/DevToys-app/DevToys',
    language: 'C#',
    topics: ['developer-tools', 'desktop-application', 'tool'],
    has_releases: true,
    fork: false,
    archived: false,
    private: false,
  },
]

export function repoKey(repo: GitHubSearchResult) {
  return `${repo.owner.login}/${repo.name}`.toLowerCase()
}

export function socialPreviewUrl(repo: GitHubSearchResult) {
  return `https://opengraph.githubassets.com/pullora-store/${repo.owner.login}/${repo.name}`
}

export function languageAccent(language?: string | null) {
  switch ((language ?? '').toLowerCase()) {
    case 'typescript':
      return '#38bdf8'
    case 'javascript':
      return '#facc15'
    case 'rust':
      return '#f97316'
    case 'python':
      return '#22c55e'
    case 'c#':
    case 'c++':
      return '#a78bfa'
    case 'go':
      return '#2dd4bf'
    default:
      return '#60a5fa'
  }
}

export function browseOptions(tab: StoreBrowseTab, query: string): StoreQueryOptions {
  const trimmedQuery = query.trim()

  switch (tab) {
    case 'popular':
      return { query: trimmedQuery, sort: 'stars' }
    case 'updated':
      return { query: trimmedQuery, sort: 'updated' }
    case 'new':
      return {
        query: [trimmedQuery, 'created:>=2025-01-01'].filter(Boolean).join(' '),
        sort: 'updated',
      }
    case 'releases':
      return { query: trimmedQuery, sort: 'stars' }
    case 'favorites':
      return { query: trimmedQuery, sort: 'updated' }
  }
}

export function repoSearchText(repo: GitHubSearchResult) {
  return [
    repo.name,
    repo.full_name,
    repo.owner.login,
    repo.description ?? '',
    repo.language ?? '',
    ...(repo.topics ?? []),
  ].join(' ').toLowerCase()
}

const crossPlatformSignals = [
  'cross-platform',
  'cross platform',
  'multiplatform',
  'multi-platform',
  'electron',
  'tauri',
  'wails',
  'qt',
  'flutter',
  'webview',
  'desktop-application',
]

const platformSignals: Record<Exclude<StorePlatform, null>, string[]> = {
  windows: ['windows', 'windows-app', 'windows-desktop', 'win32', 'win64', 'winui', 'wpf', 'uwp', 'msix', 'powershell'],
  macos: ['mac', 'macos', 'mac-os', 'osx', 'os-x', 'darwin', 'apple-silicon', 'swiftui'],
  linux: ['linux', 'appimage', 'flatpak', 'snapcraft', 'gnome', 'kde', 'gtk', 'wayland', 'x11', 'xorg', 'ubuntu', 'debian'],
  ios: ['ios', 'iphone', 'ipad'],
  android: ['android'],
  other: [],
}

function hasSignal(text: string, signals: string[]) {
  return signals.some((signal) => {
    const escaped = signal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(text)
  })
}

function repoPlatformText(repo: GitHubSearchResult) {
  return repoSearchText(repo).replace(/[_/]+/g, ' ')
}

function explicitlySupportsPlatform(repo: GitHubSearchResult, platform: Exclude<StorePlatform, null>) {
  const text = repoPlatformText(repo)
  return hasSignal(text, platformSignals[platform])
}

function explicitlyCrossPlatform(repo: GitHubSearchResult) {
  return hasSignal(repoPlatformText(repo), crossPlatformSignals)
}

function platformOnly(repo: GitHubSearchResult, platform: Exclude<StorePlatform, null>) {
  if (explicitlyCrossPlatform(repo)) return false

  const text = repoPlatformText(repo)
  if (!hasSignal(text, platformSignals[platform])) return false

  const otherPlatforms = (Object.keys(platformSignals) as Exclude<StorePlatform, null>[])
    .filter((candidate) => candidate !== platform && candidate !== 'other')

  return otherPlatforms.every((candidate) => !explicitlySupportsPlatform(repo, candidate))
}

export function supportsStorePlatform(repo: GitHubSearchResult, currentPlatform: StorePlatform) {
  if (!currentPlatform || currentPlatform === 'other') return true

  const exclusivePlatforms = (Object.keys(platformSignals) as Exclude<StorePlatform, null>[])
    .filter((platform) => platform !== currentPlatform && platform !== 'other')

  return exclusivePlatforms.every((platform) => !platformOnly(repo, platform))
}

export function filterReposForStorePlatform(repos: GitHubSearchResult[], currentPlatform: StorePlatform) {
  return repos.filter((repo) => supportsStorePlatform(repo, currentPlatform))
}

export function matchesLocalQuery(repo: GitHubSearchResult, query: string) {
  const normalized = query.trim().toLowerCase()
  return !normalized || repoSearchText(repo).includes(normalized)
}

export function uniqueRepos(repos: GitHubSearchResult[]) {
  const seen = new Set<string>()
  return repos.filter((repo) => {
    const key = repoKey(repo)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
