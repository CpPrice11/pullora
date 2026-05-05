import { callTauri } from './tauri'
import type { GitHubSearchResult, GitHubRelease } from '../types'

interface SearchResponse {
  total_count: number
  incomplete_results: boolean
  items: GitHubSearchResult[]
}

export async function searchRepositories(
  query: string,
  page = 1,
): Promise<SearchResponse> {
  return callTauri<SearchResponse>('search_repositories', { query, page })
}

export async function getReleases(
  owner: string,
  repo: string,
): Promise<GitHubRelease[]> {
  return callTauri<GitHubRelease[]>('get_releases', { owner, repo })
}

export async function clearGithubCache(): Promise<void> {
  return callTauri('clear_github_cache')
}
