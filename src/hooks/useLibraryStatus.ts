import { useCallback, useEffect, useMemo, useState } from 'react'
import type { GitHubSearchResult, InstalledApp } from '../types'
import { getReleases } from '../services/github'
import { getInstalledApps } from '../services/installed'

interface LibraryStatusState {
  installedApps: InstalledApp[]
  latestVersions: Map<string, string>
  checkingUpdates: boolean
}

function repoKey(owner: string, repo: string) {
  return `${owner}/${repo}`.toLowerCase()
}

function isSameRepo(app: InstalledApp, repo: GitHubSearchResult) {
  return (
    app.owner.toLowerCase() === repo.owner.login.toLowerCase() &&
    app.repo.toLowerCase() === repo.name.toLowerCase()
  )
}

export function useLibraryStatus(repositories: GitHubSearchResult[]) {
  const [state, setState] = useState<LibraryStatusState>({
    installedApps: [],
    latestVersions: new Map(),
    checkingUpdates: false,
  })

  const installedByRepo = useMemo(() => {
    return new Map(
      state.installedApps.map((app) => [repoKey(app.owner, app.repo), app]),
    )
  }, [state.installedApps])

  const refreshInstalledApps = useCallback(async () => {
    try {
      const apps = await getInstalledApps()
      setState((prev) => ({ ...prev, installedApps: apps }))
    } catch {
      setState((prev) => ({ ...prev, installedApps: [] }))
    }
  }, [])

  useEffect(() => {
    refreshInstalledApps()
  }, [refreshInstalledApps])

  useEffect(() => {
    let cancelled = false

    async function refreshLatestVersions() {
      const installedVisibleApps = state.installedApps.filter((app) =>
        repositories.some((repo) => isSameRepo(app, repo)),
      )

      if (installedVisibleApps.length === 0) {
        setState((prev) => ({
          ...prev,
          latestVersions: new Map(),
          checkingUpdates: false,
        }))
        return
      }

      setState((prev) => ({ ...prev, checkingUpdates: true }))

      const entries = await Promise.all(
        installedVisibleApps.map(async (app) => {
          try {
            const releases = await getReleases(app.owner, app.repo)
            const latest = releases.find(
              (release) => !release.draft && !release.prerelease,
            )
            return latest ? [repoKey(app.owner, app.repo), latest.tag_name] as const : null
          } catch {
            return null
          }
        }),
      )

      if (cancelled) return

      const validEntries = entries.filter(
        (entry): entry is readonly [string, string] => entry !== null,
      )

      setState((prev) => ({
        ...prev,
        latestVersions: new Map(validEntries),
        checkingUpdates: false,
      }))
    }

    refreshLatestVersions()

    return () => {
      cancelled = true
    }
  }, [repositories, state.installedApps])

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
    getInstalledApp,
    getLatestVersion,
    refreshInstalledApps,
  }
}
