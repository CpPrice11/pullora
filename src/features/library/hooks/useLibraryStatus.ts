import { useCallback, useEffect, useMemo, useState } from 'react'
import type { GitHubSearchResult, InstalledApp } from '../../../types'
import { getReleases } from '../../../services/github'
import { getInstalledApps } from '../../../services/installed'
import { projectArtKey } from '../../../services/projectArt'

interface LibraryStatusState {
  installedApps: InstalledApp[]
  latestVersions: Map<string, string>
  checkingUpdates: boolean
  latestVersionErrorCount: number
  latestVersionsCheckedAt: Date | null
  installedLoadError: string | null
}

interface LatestVersionCacheEntry {
  checkedAt: number
  latestVersion: string | null
}

interface LatestVersionCacheHit {
  latestVersion: string | null
}

const latestVersionCacheKey = 'pullora.library.latestVersions.v1'
const latestVersionCacheTtlMs = 24 * 60 * 60 * 1000

function readLatestVersionCache(): Record<string, LatestVersionCacheEntry> {
  try {
    const raw = window.localStorage.getItem(latestVersionCacheKey)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeLatestVersionCache(cache: Record<string, LatestVersionCacheEntry>) {
  try {
    window.localStorage.setItem(latestVersionCacheKey, JSON.stringify(cache))
  } catch {
    // A broken local cache should not block Library rendering.
  }
}

function readCachedLatestVersion(key: string, allowStale = false): LatestVersionCacheHit | null {
  const entry = readLatestVersionCache()[key]
  if (!entry) return null

  const isFresh = Date.now() - entry.checkedAt <= latestVersionCacheTtlMs
  if (!isFresh && !allowStale) return null

  return { latestVersion: entry.latestVersion ?? null }
}

function writeCachedLatestVersion(key: string, latestVersion: string | null) {
  const cache = readLatestVersionCache()
  cache[key] = {
    checkedAt: Date.now(),
    latestVersion,
  }
  writeLatestVersionCache(cache)
}

export function useLibraryStatus(_repositories: GitHubSearchResult[]) {
  const [state, setState] = useState<LibraryStatusState>({
    installedApps: [],
    latestVersions: new Map(),
    checkingUpdates: false,
    latestVersionErrorCount: 0,
    latestVersionsCheckedAt: null,
    installedLoadError: null,
  })

  const installedByRepo = useMemo(() => {
    return new Map(
      state.installedApps.map((app) => [projectArtKey(app.owner, app.repo), app]),
    )
  }, [state.installedApps])

  const refreshInstalledApps = useCallback(async () => {
    try {
      const apps = await getInstalledApps()
      setState((prev) => ({ ...prev, installedApps: apps, installedLoadError: null }))
      return apps
    } catch (err) {
      setState((prev) => ({
        ...prev,
        installedApps: [],
        installedLoadError: err instanceof Error ? err.message : 'Failed to load installed apps',
      }))
      return []
    }
  }, [])

  useEffect(() => {
    refreshInstalledApps()
  }, [refreshInstalledApps])

  const refreshLatestVersions = useCallback(async (
    apps: InstalledApp[] = state.installedApps,
    _repoItems?: GitHubSearchResult[],
    forceRefresh = false,
  ) => {
    if (apps.length === 0) {
      setState((prev) => ({
        ...prev,
        latestVersions: new Map(),
        checkingUpdates: false,
        latestVersionErrorCount: 0,
        latestVersionsCheckedAt: new Date(),
      }))
      return new Map<string, string>()
    }

    setState((prev) => ({ ...prev, checkingUpdates: true }))

    const entries = await Promise.all(
      apps.map(async (app) => {
        const key = projectArtKey(app.owner, app.repo)
        const cached = forceRefresh ? null : readCachedLatestVersion(key)
        if (cached) {
          return cached.latestVersion ? [key, cached.latestVersion] as const : null
        }

        try {
          const releases = await getReleases(app.owner, app.repo)
          const latest = releases.find(
            (release) => !release.draft && !release.prerelease,
          )
          const latestVersion = latest?.tag_name ?? null
          writeCachedLatestVersion(key, latestVersion)
          return latestVersion ? [key, latestVersion] as const : null
        } catch {
          const stale = readCachedLatestVersion(key, true)
          if (stale) {
            return stale.latestVersion ? [key, stale.latestVersion] as const : null
          }
          return 'failed' as const
        }
      }),
    )

    const validEntries = entries.filter(
      (entry): entry is readonly [string, string] => Array.isArray(entry),
    )
    const failedCount = entries.filter((entry) => entry === 'failed').length

    const latestVersions = new Map(validEntries)
    setState((prev) => ({
      ...prev,
      latestVersions,
      checkingUpdates: false,
      latestVersionErrorCount: failedCount,
      latestVersionsCheckedAt: new Date(),
    }))
    return latestVersions
  }, [state.installedApps])

  const getInstalledApp = useCallback(
    (repo: GitHubSearchResult) => installedByRepo.get(projectArtKey(repo.owner.login, repo.name)),
    [installedByRepo],
  )

  const getLatestVersion = useCallback(
    (repo: GitHubSearchResult) => state.latestVersions.get(projectArtKey(repo.owner.login, repo.name)),
    [state.latestVersions],
  )

  return {
    installedApps: state.installedApps,
    latestVersions: state.latestVersions,
    checkingUpdates: state.checkingUpdates,
    latestVersionErrorCount: state.latestVersionErrorCount,
    latestVersionsCheckedAt: state.latestVersionsCheckedAt,
    installedLoadError: state.installedLoadError,
    getInstalledApp,
    getLatestVersion,
    refreshInstalledApps,
    refreshLatestVersions,
  }
}
