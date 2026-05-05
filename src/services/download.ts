import { callTauri } from './tauri'
import type { DownloadProgress } from '../types'

export async function startDownload(
  url: string,
  fileName: string,
  owner: string,
  repo: string,
  tag: string,
): Promise<string> {
  return callTauri<string>('start_download', { url, fileName, owner, repo, tag })
}

export async function getDownloads(): Promise<DownloadProgress[]> {
  return callTauri<DownloadProgress[]>('get_downloads')
}

export async function cancelDownload(id: string): Promise<void> {
  return callTauri('cancel_download', { id })
}
