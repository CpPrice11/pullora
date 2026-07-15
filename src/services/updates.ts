import { callTauri } from './tauri'
import type { LauncherStorageInfo } from '../types'

export async function getLauncherVersion(): Promise<string> {
  return callTauri<string>('get_launcher_version')
}

export async function openDir(path: string): Promise<void> {
  return callTauri('open_dir', { path })
}

export async function openExternalUrl(url: string): Promise<void> {
  return callTauri('open_external_url', { url })
}

export async function getLauncherStorageInfo(): Promise<LauncherStorageInfo> {
  return callTauri<LauncherStorageInfo>('get_launcher_storage_info')
}

export async function cleanupLauncherUpdateFiles(): Promise<LauncherStorageInfo> {
  return callTauri<LauncherStorageInfo>('cleanup_launcher_update_files')
}

export async function installLauncherRelease(
  version: string,
  assetUrl: string,
  assetName: string,
  checksumUrl: string,
): Promise<void> {
  return callTauri('install_launcher_release', { version, assetUrl, assetName, checksumUrl })
}
