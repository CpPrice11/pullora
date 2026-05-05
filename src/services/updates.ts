import { callTauri } from './tauri'
import type { UpdateAvailable } from '../types'

export async function checkForUpdates(): Promise<UpdateAvailable[]> {
  return callTauri<UpdateAvailable[]>('check_for_updates')
}

export async function openDir(path: string): Promise<void> {
  return callTauri('open_dir', { path })
}
