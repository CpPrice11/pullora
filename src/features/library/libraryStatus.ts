import type { InstalledApp } from '../../types'

export type LibraryAppStatus = 'update' | 'installed' | 'available'

export function getLibraryAppStatus(
  installedApp?: InstalledApp,
  latestVersion?: string | null,
): LibraryAppStatus {
  if (installedApp && latestVersion && latestVersion !== installedApp.activeVersion) return 'update'
  return installedApp ? 'installed' : 'available'
}

export function getLibraryStatusRank(status: LibraryAppStatus) {
  return status === 'update' ? 0 : status === 'installed' ? 1 : 2
}

export function getUpdateDismissKey(owner: string, repo: string, latestVersion: string) {
  return `${owner}/${repo}@${latestVersion}`.toLowerCase()
}
