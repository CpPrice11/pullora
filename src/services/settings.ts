import { callTauri } from './tauri'
import type { AppSettings, InstallPathValidation } from '../types'

export const SETTINGS_CHANGE_EVENT = 'pullora-settings-change'

function notifySettingsChange(settings: Partial<AppSettings>) {
  window.dispatchEvent(new CustomEvent<Partial<AppSettings>>(SETTINGS_CHANGE_EVENT, {
    detail: settings,
  }))
}

export async function getSettings(): Promise<AppSettings> {
  return callTauri<AppSettings>('get_settings')
}

export async function isPortableMode(): Promise<boolean> {
  return callTauri<boolean>('is_portable_mode')
}

export async function updateSettings(settings: AppSettings): Promise<void> {
  await callTauri('update_settings', { newSettings: settings })
  notifySettingsChange(settings)
}

export async function setInstallationPath(path: string): Promise<void> {
  await callTauri('set_installation_path', { path })
  notifySettingsChange({ installationPath: path })
}

export async function checkIsFirstLaunch(): Promise<boolean> {
  return callTauri<boolean>('is_first_launch')
}

export async function validateInstallationPath(path: string): Promise<InstallPathValidation> {
  return callTauri<InstallPathValidation>('validate_installation_path', { path })
}
