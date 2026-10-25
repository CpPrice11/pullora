import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GitHubSearchResult, InstalledApp, DetectedInstallation, AppRuntimeState, InstallationSnapshot } from '../../../types'
import { getReleases } from '../../../services/github'
import { getInstallationSnapshot, getAppRuntimeStates } from '../../../services/installed'
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
          const releases = await getReleases(app.owner, app.repo, forceRefresh)
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
    refreshInstalledApps,
    refreshLatestVersions,
  }
}
