import { callTauri } from './tauri'
import type { UpdateAvailable } from '../types'

export async function checkForUpdates(): Promise<UpdateAvailable[]> {
  return callTauri<UpdateAvailable[]>('check_for_updates')
}

export async function getLauncherVersion(): Promise<string> {
  return callTauri<string>('get_launcher_version')
}

export async function openDir(path: string): Promise<void> {
  return callTauri('open_dir', { path })
}

export async function installLauncherRelease(
  version: string,
  assetUrl: string,
  assetName: string,
): Promise<void> {
  return callTauri('install_launcher_release', { version, assetUrl, assetName })
}
