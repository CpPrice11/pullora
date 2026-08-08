import { callTauri } from './tauri'
import type { LauncherStorageInfo } from '../types'
import { redactSensitiveText } from '../utils/redactSensitiveText'

export async function getLauncherVersion(): Promise<string> {
  return callTauri<string>('get_launcher_version')
}

export async function getEventLog(): Promise<string[]> {
  return (await callTauri<string[]>('get_event_log')).map(redactSensitiveText)
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
