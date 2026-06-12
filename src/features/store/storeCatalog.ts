import type { GitHubSearchResult } from '../../types'

export type StoreBrowseTab = 'popular' | 'updated' | 'new' | 'releases' | 'favorites'
export type StoreInstallableFilter = 'all' | 'installable'
export type StoreSort = 'updated' | 'stars' | 'forks'

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

export function repoKey(repo: GitHubSearchResult) {
  return `${repo.owner.login}/${repo.name}`.toLowerCase()
}

export function socialPreviewUrl(repo: GitHubSearchResult) {
  return `https://opengraph.githubassets.com/air-launcher-store/${repo.owner.login}/${repo.name}`
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
