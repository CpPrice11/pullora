import { callTauri } from './tauri'
import type {
  GitHubQueueStatus,
  GitHubRateLimitStatus,
  GitHubRelease,
  OwnerRepositoriesResponse,
} from '../types'

const inFlightRequests = new Map<string, Promise<unknown>>()
let activeRequestCount = 0

function dedupeGithubRequest<T>(key: string, request: () => Promise<T>): Promise<T> {
  const currentRequest = inFlightRequests.get(key)
  if (currentRequest) return currentRequest as Promise<T>

  activeRequestCount += 1
  const pending = request().finally(() => {
    activeRequestCount = Math.max(0, activeRequestCount - 1)
    inFlightRequests.delete(key)
  })
  inFlightRequests.set(key, pending)
  return pending
}

export function getGithubQueueStatus(): GitHubQueueStatus {
  return {
    active: activeRequestCount,
    queued: 0,
    concurrency: activeRequestCount,
    highPriority: 0,
    normalPriority: 0,
    pausedUntil: null,
  }
}

export async function listOwnerRepositories(
  owner: string,
  page = 1,
  releasesOnly = false,
  forceRefresh = false,
): Promise<OwnerRepositoriesResponse> {
  const normalizedOwner = owner.trim().toLowerCase()
  const key = `owner:${normalizedOwner}:${page}:${releasesOnly}:${forceRefresh}`
  return dedupeGithubRequest(key, () =>
    callTauri<OwnerRepositoriesResponse>('list_owner_repositories', {
      owner,
      page,
      releasesOnly,
      forceRefresh,
    }),
  )
}

export async function getReleases(
  owner: string,
  repo: string,
  forceRefresh = false,
): Promise<GitHubRelease[]> {
  const key = `releases:${owner.trim().toLowerCase()}/${repo.trim().toLowerCase()}:${forceRefresh}`
  return dedupeGithubRequest(key, () =>
    callTauri<GitHubRelease[]>('get_releases', { owner, repo, forceRefresh }),
  )
}

export async function clearGithubCache(): Promise<void> {
  inFlightRequests.clear()
  return callTauri('clear_github_cache')
}

export async function getGithubRateLimitStatus(): Promise<GitHubRateLimitStatus> {
  return callTauri<GitHubRateLimitStatus>('get_github_rate_limit_status')
}
