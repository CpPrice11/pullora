import type { InstalledApp, VersionInfo } from '../../types'

export interface SequentialBulkResult {
  succeededKeys: string[]
  failedKeys: string[]
}

export interface InactiveInstalledVersion {
  app: InstalledApp
  version: VersionInfo
}

export function getInactiveInstalledVersions(apps: InstalledApp[]): InactiveInstalledVersion[] {
  return apps.flatMap((app) => app.versions
    .filter((version) => version.tag !== app.activeVersion)
    .map((version) => ({ app, version })))
}

export async function runSequentialBulk<T>(
  items: T[],
  keyOf: (item: T) => string,
  action: (item: T) => Promise<void>,
): Promise<SequentialBulkResult> {
  const result: SequentialBulkResult = { succeededKeys: [], failedKeys: [] }
  for (const item of items) {
    try {
      await action(item)
      result.succeededKeys.push(keyOf(item))
    } catch {
      result.failedKeys.push(keyOf(item))
    }
  }
  return result
}
