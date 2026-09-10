import { callTauri } from './tauri'
import type { InstalledApp } from '../types'

export async function getInstalledApps(): Promise<InstalledApp[]> {
  return callTauri<InstalledApp[]>('get_installed_apps')
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
