import { useCallback, useEffect, useMemo, useState } from 'react'
import type { GitHubSearchResult, InstalledApp } from '../../../types'
import { getReleases } from '../../../services/github'
import { getInstalledApps } from '../../../services/installed'

interface LibraryStatusState {
  installedApps: InstalledApp[]
  latestVersions: Map<string, string>
  checkingUpdates: boolean
  latestVersionErrorCount: number
  latestVersionsCheckedAt: Date | null
  installedLoadError: string | null
}

function repoKey(owner: string, repo: string) {
  return `${owner}/${repo}`.toLowerCase()
}

export function useLibraryStatus(repositories: GitHubSearchResult[]) {
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
      state.installedApps.map((app) => [repoKey(app.owner, app.repo), app]),
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
    _repoItems: GitHubSearchResult[] = repositories,
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
        try {
          const releases = await getReleases(app.owner, app.repo)
          const latest = releases.find(
            (release) => !release.draft && !release.prerelease,
          )
          return latest ? [repoKey(app.owner, app.repo), latest.tag_name] as const : null
        } catch {
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
  }, [repositories, state.installedApps])

  useEffect(() => {
    refreshLatestVersions()
  }, [refreshLatestVersions])

  const getInstalledApp = useCallback(
    (repo: GitHubSearchResult) => installedByRepo.get(repoKey(repo.owner.login, repo.name)),
    [installedByRepo],
  )

  const getLatestVersion = useCallback(
    (repo: GitHubSearchResult) => state.latestVersions.get(repoKey(repo.owner.login, repo.name)),
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
