import { callTauri } from './tauri'
import type { LauncherInstallationMode, LauncherStorageInfo } from '../types'
import { redactSensitiveText } from '../utils/redactSensitiveText'

export async function getLauncherVersion(): Promise<string> {
  return callTauri<string>('get_launcher_version')
}

export async function getLauncherInstallationMode(): Promise<LauncherInstallationMode> {
  return callTauri<LauncherInstallationMode>('get_launcher_installation_mode')
}

export async function installLauncherUpdate(
  version: string,
): Promise<void> {
  return callTauri('install_launcher_update', { version })
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

export function projectWebsiteUrl(value?: string | null): string | null {
  if (!value || value.length > 2048 || /[\u0000-\u0020\u007f]/.test(value)) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname && !url.username && !url.password && !url.port
      ? url.href
      : null
  } catch {
    return null
  }
}

export async function openWebsiteUrl(url: string): Promise<void> {
  return callTauri('open_website_url', { url })
}

export async function getLauncherStorageInfo(): Promise<LauncherStorageInfo> {
  return callTauri<LauncherStorageInfo>('get_launcher_storage_info')
}

export async function cleanupLauncherUpdateFiles(): Promise<LauncherStorageInfo> {
  return callTauri<LauncherStorageInfo>('cleanup_launcher_update_files')
}
