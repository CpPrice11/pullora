import { callTauri } from './tauri'
import type { InstalledApp } from '../types'

export interface InstalledRegistryTransfer {
  appCount: number
  versionCount: number
}

export async function getInstalledApps(): Promise<InstalledApp[]> {
  return callTauri<InstalledApp[]>('get_installed_apps')
}

export async function exportInstalledRegistry(path: string): Promise<InstalledRegistryTransfer> {
  return callTauri<InstalledRegistryTransfer>('export_installed_registry', { path })
}

export async function importInstalledRegistry(path: string): Promise<InstalledRegistryTransfer> {
  return callTauri<InstalledRegistryTransfer>('import_installed_registry', { path })
}

export async function uninstallVersion(owner: string, repo: string, tag: string): Promise<void> {
  return callTauri('uninstall_version', { owner, repo, tag })
}

export async function uninstallApp(owner: string, repo: string): Promise<void> {
  return callTauri('uninstall_app', { owner, repo })
}

export async function launchApp(owner: string, repo: string): Promise<void> {
  return callTauri('launch_app', { owner, repo })
}

export async function openInstalledAppDir(owner: string, repo: string): Promise<void> {
  return callTauri('open_installed_app_dir', { owner, repo })
}

export async function cleanupIncompleteInstalls(): Promise<number> {
  return callTauri<number>('cleanup_incomplete_installs')
}
