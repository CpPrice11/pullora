import { callTauri } from './tauri'
import type { AppSettings } from '../types'

export async function getSettings(): Promise<AppSettings> {
  return callTauri<AppSettings>('get_settings')
}

export async function updateSettings(settings: AppSettings): Promise<void> {
  return callTauri('update_settings', { newSettings: settings })
}

export async function setInstallationPath(path: string): Promise<void> {
  return callTauri('set_installation_path', { path })
}

export async function checkIsFirstLaunch(): Promise<boolean> {
  return callTauri<boolean>('is_first_launch')
}
