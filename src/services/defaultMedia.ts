import { convertFileSrc } from '@tauri-apps/api/core'
import { callTauri } from './tauri'

export async function listDefaultProjectIcons(refresh = false): Promise<Record<string, string>> {
  const icons = await callTauri<Array<{ key: string; iconPath: string }>>('list_default_project_icons', { refresh })
  return Object.fromEntries(icons.map(({ key, iconPath }) => [key, convertFileSrc(iconPath)]))
}

export async function getDefaultProjectScreenshots(key: string): Promise<string[]> {
  const paths = await callTauri<string[]>('get_default_project_screenshots', { key })
  return paths.map((path) => convertFileSrc(path))
}
