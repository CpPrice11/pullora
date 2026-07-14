import { callTauri, TauriCommandError } from './tauri'
import type {
  GitHubQueueStatus,
  GitHubRateLimitStatus,
  GitHubRelease,
  OwnerRepositoriesResponse,
} from '../types'

const githubCacheKey = 'pullora.github.api-cache.v2'
const githubRateLimitKey = 'pullora.github.rate-limit.v1'
const ownerCacheTtlMs = 6 * 60 * 60 * 1000
const releasesCacheTtlMs = 6 * 60 * 60 * 1000
const fallbackRateLimitCooldownMs = 15 * 60 * 1000
const forceRefreshCooldownMs = 30 * 1000
const maxCacheEntries = 200
const githubRequestConcurrency = 2
type GitHubRateLimitBucket = 'core' | 'search'
type GitHubRequestPriority = 'high' | 'normal'

interface QueuedGithubRequest {
  bucket: GitHubRateLimitBucket
  priority: GitHubRequestPriority
  sequence: number
  start: () => void
}

interface GitHubCacheEntry {
  cachedAt: number
  expiresAt: number
  data: unknown
}

type GitHubCache = Record<string, GitHubCacheEntry>

const inFlightRequests = new Map<string, Promise<unknown>>()
const requestQueue: QueuedGithubRequest[] = []
let activeRequestCount = 0
let requestSequence = 0
let queueWakeTimer: number | null = null

const priorityRank: Record<GitHubRequestPriority, number> = {
  high: 0,
  normal: 1,
}

function scheduleQueueWake() {
  if (queueWakeTimer !== null) {
    window.clearTimeout(queueWakeTimer)
    queueWakeTimer = null
  }

  const now = Date.now()
  const resetTimes = requestQueue
    .map((item) => readRateLimitBlockedUntil(item.bucket))
    .filter((resetAt) => resetAt > now)
  if (resetTimes.length === 0) return

  const nextReset = Math.min(...resetTimes)
  queueWakeTimer = window.setTimeout(() => {
    queueWakeTimer = null
    runQueuedRequests()
  }, Math.min(Math.max(nextReset - now + 250, 250), 2_147_000_000))
}

function runQueuedRequests() {
  requestQueue.sort((left, right) =>
    priorityRank[left.priority] - priorityRank[right.priority]
    || left.sequence - right.sequence,
  )

  while (activeRequestCount < githubRequestConcurrency && requestQueue.length > 0) {
    const now = Date.now()
    const nextIndex = requestQueue.findIndex(
      (item) => readRateLimitBlockedUntil(item.bucket) <= now,
    )
    if (nextIndex < 0) {
      scheduleQueueWake()
      return
    }

    const [next] = requestQueue.splice(nextIndex, 1)
    activeRequestCount += 1
    next.start()
  }
}

function enqueueGithubRequest<T>(
  request: () => Promise<T>,
  bucket: GitHubRateLimitBucket,
  priority: GitHubRequestPriority,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    requestQueue.push({
      bucket,
      priority,
      sequence: requestSequence++,
      start: () => {
        request()
          .then(resolve, reject)
          .finally(() => {
            activeRequestCount = Math.max(0, activeRequestCount - 1)
            runQueuedRequests()
          })
      },
    })
    runQueuedRequests()
  })
}

export function getGithubQueueStatus(): GitHubQueueStatus {
  const now = Date.now()
  const pausedUntilValues = requestQueue
    .map((item) => readRateLimitBlockedUntil(item.bucket))
    .filter((resetAt) => resetAt > now)

  return {
    active: activeRequestCount,
    queued: requestQueue.length,
    concurrency: githubRequestConcurrency,
    highPriority: requestQueue.filter((item) => item.priority === 'high').length,
    normalPriority: requestQueue.filter((item) => item.priority === 'normal').length,
    pausedUntil: pausedUntilValues.length > 0 ? Math.min(...pausedUntilValues) : null,
  }
}

function readCache(): GitHubCache {
  try {
    const raw = window.localStorage.getItem(githubCacheKey)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeCache(cache: GitHubCache) {
  try {
    const entries = Object.entries(cache)
      .sort(([, left], [, right]) => right.cachedAt - left.cachedAt)
      .slice(0, maxCacheEntries)
    window.localStorage.setItem(githubCacheKey, JSON.stringify(Object.fromEntries(entries)))
  } catch {
    // GitHub access must keep working even when persistent cache is unavailable.
  }
}

function rateLimitStorageKey(bucket: GitHubRateLimitBucket) {
  return `${githubRateLimitKey}.${bucket}`
}

function readRateLimitBlockedUntil(bucket: GitHubRateLimitBucket) {
  try {
    const value = Number(window.localStorage.getItem(rateLimitStorageKey(bucket)))
    return Number.isFinite(value) ? value : 0
  } catch {
    return 0
  }
}

function rememberRateLimit(error: unknown, bucket: GitHubRateLimitBucket) {
  const message = error instanceof TauriCommandError
    ? `${error.code}|${error.rawMessage}`
    : error instanceof Error ? error.message : String(error)
  if (!/githubRateLimited|rate limit|api limit|status 403/i.test(message)) return

  const resetMatch = message.match(/(?:reset(?:s)?(?: at| in)?\s*|\|)(\d{10,13})/i)
  const rawReset = resetMatch ? Number(resetMatch[1]) : 0
  const resetAt = rawReset > 0
    ? rawReset < 10_000_000_000 ? rawReset * 1000 : rawReset
    : Date.now() + fallbackRateLimitCooldownMs

  try {
    window.localStorage.setItem(rateLimitStorageKey(bucket), String(resetAt))
  } catch {
    // The backend still prevents requests when localStorage is unavailable.
  }
  scheduleQueueWake()
}

function clearRememberedRateLimit(bucket: GitHubRateLimitBucket) {
  try {
    window.localStorage.removeItem(rateLimitStorageKey(bucket))
  } catch {
    // Ignore unavailable localStorage.
  }
  runQueuedRequests()
}

async function cachedGithubRequest<T>(
  key: string,
  ttlMs: number,
  bucket: GitHubRateLimitBucket,
  priority: GitHubRequestPriority,
  forceRefresh: boolean,
  request: () => Promise<T>,
): Promise<T> {
  const cache = readCache()
  const cached = cache[key]
  const now = Date.now()

  if (!forceRefresh && cached && cached.expiresAt > now) {
    return cached.data as T
  }

  if (forceRefresh && cached && now - cached.cachedAt < forceRefreshCooldownMs) {
    return cached.data as T
  }

  if (readRateLimitBlockedUntil(bucket) > now) {
    if (cached) return cached.data as T
  }

  const currentRequest = inFlightRequests.get(key)
  if (currentRequest) return currentRequest as Promise<T>

  const pending = enqueueGithubRequest(request, bucket, priority)
    .then((data) => {
      const nextCache = readCache()
      nextCache[key] = {
        cachedAt: Date.now(),
        expiresAt: Date.now() + ttlMs,
        data,
      }
      writeCache(nextCache)
      clearRememberedRateLimit(bucket)
      return data
    })
    .catch((error) => {
      rememberRateLimit(error, bucket)
      const stale = readCache()[key]
      if (stale) return stale.data as T
      throw error
    })
    .finally(() => {
      inFlightRequests.delete(key)
    })

  inFlightRequests.set(key, pending)
  return pending
}

export async function listOwnerRepositories(
  owner: string,
  page = 1,
  releasesOnly = false,
  forceRefresh = false,
): Promise<OwnerRepositoriesResponse> {
  const normalizedOwner = owner.trim().toLowerCase()
  const key = `owner:${normalizedOwner}:${page}:${releasesOnly}`
  return cachedGithubRequest(key, ownerCacheTtlMs, 'core', 'normal', forceRefresh, () =>
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
  const key = `releases:${owner.trim().toLowerCase()}/${repo.trim().toLowerCase()}`
  return cachedGithubRequest(key, releasesCacheTtlMs, 'core', 'high', forceRefresh, () =>
    callTauri<GitHubRelease[]>('get_releases', { owner, repo, forceRefresh }),
  )
}

export async function clearGithubCache(): Promise<void> {
  try {
    window.localStorage.removeItem(githubCacheKey)
    window.localStorage.removeItem(rateLimitStorageKey('core'))
    window.localStorage.removeItem(rateLimitStorageKey('search'))
  } catch {
    // Continue with the native cache cleanup.
  }
  inFlightRequests.clear()
  return callTauri('clear_github_cache')
}

export async function getGithubRateLimitStatus(): Promise<GitHubRateLimitStatus> {
  return callTauri<GitHubRateLimitStatus>('get_github_rate_limit_status')
}
