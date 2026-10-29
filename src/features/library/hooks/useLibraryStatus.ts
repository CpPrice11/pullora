import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GitHubSearchResult, InstalledApp, DetectedInstallation, AppRuntimeState, InstallationSnapshot } from '../../../types'
import { listen } from '@tauri-apps/api/event'
import { getReleases } from '../../../services/github'
import { getInstallationSnapshot, getAppRuntimeStates } from '../../../services/installed'
import { projectArtKey } from '../../../services/projectArt'

interface LibraryStatusState {
  installedApps: InstalledApp[]
  latestVersions: Map<string, string>
  releaseDates: Map<string, string | null>
  checkingUpdates: boolean
  latestVersionErrorCount: number
  latestVersionsCheckedAt: Date | null
  installedLoadError: string | null
}

interface LatestVersionCacheEntry {
  checkedAt: number
  latestVersion: string | null
  publishedAt?: string | null
}

interface LatestVersionCacheHit {
  latestVersion: string | null
  publishedAt?: string | null
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
  if (!entry || (!allowStale && !('publishedAt' in entry))) return null

  const isFresh = Date.now() - entry.checkedAt <= latestVersionCacheTtlMs
  if (!isFresh && !allowStale) return null

  return { latestVersion: entry.latestVersion ?? null, publishedAt: entry.publishedAt ?? null }
}

function writeCachedLatestVersion(key: string, latestVersion: string | null, publishedAt: string | null) {
  const cache = readLatestVersionCache()
  cache[key] = {
    checkedAt: Date.now(),
    latestVersion,
    publishedAt,
  }
  writeLatestVersionCache(cache)
}

export function useLibraryStatus(_repositories: GitHubSearchResult[]) {
  const [runtimeStates, setRuntimeStates] = useState<AppRuntimeState[]>([])
  const [runtimeError, setRuntimeError] = useState<string | null>(null)
  const [discoveredApps, setDiscoveredApps] = useState<DetectedInstallation[]>([])
  const [discoveryError, setDiscoveryError] = useState<string | null>(null)
  const [installationHealth, setInstallationHealth] = useState<InstallationSnapshot['health']>([])
  const localRefreshRef = useRef<Promise<InstalledApp[]> | null>(null)

  const refreshRuntime = useCallback(async () => {
    try { setRuntimeStates(await getAppRuntimeStates()); setRuntimeError(null) }
    catch (error) { setRuntimeError(error instanceof Error ? error.message : String(error)) }
  }, [])
  useEffect(() => {
    let active = true
    let pending = false
    let timer: number | undefined
    const poll = async () => {
      if (!active || pending || document.hidden) return
      window.clearTimeout(timer)
      pending = true
      await refreshRuntime()
      pending = false
      if (active && !document.hidden) timer = window.setTimeout(poll, 3000)
    }
    const wake = () => { window.clearTimeout(timer); void poll() }
    void poll()
    document.addEventListener('visibilitychange', wake)
    window.addEventListener('focus', wake)
    return () => { active = false; window.clearTimeout(timer); document.removeEventListener('visibilitychange', wake); window.removeEventListener('focus', wake) }
  }, [refreshRuntime])
  const runtimeByRepo = useMemo(() => new Map(runtimeStates.filter((app) => app.running || app.uncertain)
    .map((app) => [projectArtKey(app.owner, app.repo), app.uncertain ? 'unknown' as const : 'running' as const])), [runtimeStates])
  const [state, setState] = useState<LibraryStatusState>({
    installedApps: [],
    latestVersions: new Map(),
    releaseDates: new Map(),
    checkingUpdates: false,
    latestVersionErrorCount: 0,
    latestVersionsCheckedAt: null,
    installedLoadError: null,
  })

  useEffect(() => {
    let disposed = false
    let unsubscribe: (() => void) | undefined
    void listen<{ owner: string; repo: string; version: string; publishedAt: string | null }>('library-release-checked', ({ payload }) => {
      const key = projectArtKey(payload.owner, payload.repo)
      writeCachedLatestVersion(key, payload.version, payload.publishedAt)
      setState(previous => ({ ...previous, latestVersions: new Map(previous.latestVersions).set(key, payload.version), releaseDates: new Map(previous.releaseDates).set(key, payload.publishedAt) }))
    }).then(stop => { if (disposed) stop(); else unsubscribe = stop }).catch(() => {})
    return () => { disposed = true; unsubscribe?.() }
  }, [])

  const installedByRepo = useMemo(() => {
    return new Map(
      state.installedApps.map((app) => [projectArtKey(app.owner, app.repo), app]),
    )
  }, [state.installedApps])

  const refreshInstalledApps = useCallback((): Promise<InstalledApp[]> => {
    if (localRefreshRef.current) return localRefreshRef.current
    const pending = getInstallationSnapshot().then((snapshot) => {
      setState((prev) => ({ ...prev, installedApps: snapshot.installedApps, installedLoadError: null }))
      setDiscoveredApps(snapshot.discoveredApps)
      setInstallationHealth(snapshot.health)
      setDiscoveryError(null)
      return snapshot.installedApps
    }).catch((error) => {
      const message = error instanceof Error ? error.message : String(error)
      setDiscoveryError(message)
      // A failed scan must not erase library records or replace them with an empty list.
      return []
    }).finally(() => { localRefreshRef.current = null })
    localRefreshRef.current = pending
    return pending
  }, [])

  useEffect(() => {
    let active = true
    let scanning = false
    let timer: number | undefined
    const scan = async () => {
      window.clearTimeout(timer)
      if (!active || document.hidden || scanning) return
      scanning = true
      await refreshInstalledApps()
      scanning = false
      if (active && !document.hidden) timer = window.setTimeout(scan, 30000)
    }
    const wake = () => { void scan() }
    void scan()
    window.addEventListener('focus', wake)
    document.addEventListener('visibilitychange', wake)
    return () => { active = false; window.clearTimeout(timer); window.removeEventListener('focus', wake); document.removeEventListener('visibilitychange', wake) }
  }, [refreshInstalledApps])

  const healthByRepo = useMemo(() => new Map(installationHealth.map((app) => [projectArtKey(app.owner, app.repo), app.status])), [installationHealth])

  const refreshLatestVersions = useCallback(async (
    apps: InstalledApp[] = state.installedApps,
    repoItems?: GitHubSearchResult[],
    forceRefresh = false,
  ) => {
    const targets = [...new Map([
      ...apps.map(app => ({ owner: app.owner, repo: app.repo })),
      ...(repoItems ?? []).filter(repo => repo.has_releases && !repo.website_url).map(repo => ({ owner: repo.owner.login, repo: repo.name })),
    ].map(app => [projectArtKey(app.owner, app.repo), app])).values()]
    if (targets.length === 0) {
      setState((prev) => ({
        ...prev,
        latestVersions: new Map(),
    releaseDates: new Map(),
        checkingUpdates: false,
        latestVersionErrorCount: 0,
        latestVersionsCheckedAt: new Date(),
      }))
      return new Map<string, string>()
    }

    setState((prev) => ({ ...prev, checkingUpdates: true }))

    const entries = await Promise.all(
      targets.map(async (app) => {
        const key = projectArtKey(app.owner, app.repo)
        const cached = forceRefresh ? null : readCachedLatestVersion(key)
        if (cached) {
          return cached.latestVersion ? [key, cached.latestVersion, cached.publishedAt ?? null] as const : null
        }

        try {
          const releases = await getReleases(app.owner, app.repo, forceRefresh)
          const latest = releases.find(
            (release) => !release.draft && !release.prerelease,
          )
          const latestVersion = latest?.tag_name ?? null
          writeCachedLatestVersion(key, latestVersion, latest?.published_at ?? null)
          return latestVersion ? [key, latestVersion, latest?.published_at ?? null] as const : null
        } catch {
          const stale = readCachedLatestVersion(key, true)
          if (stale) {
            return stale.latestVersion ? [key, stale.latestVersion, stale.publishedAt ?? null] as const : null
          }
          return 'failed' as const
        }
      }),
    )

    const validEntries = entries.filter(
      (entry): entry is readonly [string, string, string | null] => Array.isArray(entry),
    )
    const failedCount = entries.filter((entry) => entry === 'failed').length

    const latestVersions = new Map(validEntries.map(([key, tag]) => [key, tag]))
    const releaseDates = new Map(validEntries.map(([key, , date]) => [key, date]))
    setState((prev) => ({
      ...prev,
      latestVersions,
      releaseDates,
      checkingUpdates: false,
      latestVersionErrorCount: failedCount,
      latestVersionsCheckedAt: new Date(),
    }))
    return latestVersions
  }, [state.installedApps])

  const metadataTargets = useRef<GitHubSearchResult[] | null>(null)
  useEffect(() => {
    if (!_repositories.length || _repositories === metadataTargets.current) return
    metadataTargets.current = _repositories
    void refreshLatestVersions(state.installedApps, _repositories)
  }, [_repositories, refreshLatestVersions, state.installedApps])

  const getInstalledApp = useCallback(
    (repo: GitHubSearchResult) => repo.website_url ? undefined : installedByRepo.get(projectArtKey(repo.owner.login, repo.name)),
    [installedByRepo],
  )

  const getLatestVersion = useCallback(
    (repo: GitHubSearchResult) => repo.website_url ? undefined : state.latestVersions.get(projectArtKey(repo.owner.login, repo.name)),
    [state.latestVersions],
  )

  return {
    discoveredApps, discoveryError, refreshDiscovered: refreshInstalledApps, healthByRepo,
    runtimeByRepo, runtimeError, refreshRuntime,
    installedApps: state.installedApps,
    latestVersions: state.latestVersions,
    checkingUpdates: state.checkingUpdates,
    latestVersionErrorCount: state.latestVersionErrorCount,
    latestVersionsCheckedAt: state.latestVersionsCheckedAt,
    installedLoadError: state.installedLoadError,
    getInstalledApp,
    getLatestVersion,
    getReleaseDate: (repo: GitHubSearchResult) => state.releaseDates.get(projectArtKey(repo.owner.login, repo.name)),
    refreshInstalledApps,
    refreshLatestVersions,
  }
}
