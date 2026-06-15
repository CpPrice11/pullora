import { callTauri } from './tauri'
import type {
  GitHubRelease,
  OwnerRepositoriesResponse,
} from '../types'

export async function listOwnerRepositories(
  owner: string,
  page = 1,
  releasesOnly = false,
): Promise<OwnerRepositoriesResponse> {
  return callTauri<OwnerRepositoriesResponse>('list_owner_repositories', {
    owner,
    page,
    releasesOnly,
  })
}

export async function searchPublicRepositories(
  query = '',
  page = 1,
  options: {
    sort?: 'updated' | 'stars' | 'forks'
    language?: string
    topic?: string
    releasesOnly?: boolean
  } = {},
): Promise<OwnerRepositoriesResponse> {
  return callTauri<OwnerRepositoriesResponse>('search_public_repositories', {
    query,
    page,
    sort: options.sort,
    language: options.language,
    topic: options.topic,
    releasesOnly: options.releasesOnly,
  })
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
