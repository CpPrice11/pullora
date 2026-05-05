import { callTauri } from './tauri'
import type { InstalledApp } from '../types'

export async function getInstalledApps(): Promise<InstalledApp[]> {
  return callTauri<InstalledApp[]>('get_installed_apps')
}

export async function switchVersion(owner: string, repo: string, tag: string): Promise<void> {
  return callTauri('switch_version', { owner, repo, tag })
}

export async function uninstallVersion(owner: string, repo: string, tag: string): Promise<void> {
  return callTauri('uninstall_version', { owner, repo, tag })
}

export async function launchApp(owner: string, repo: string): Promise<void> {
  return callTauri('launch_app', { owner, repo })
}
