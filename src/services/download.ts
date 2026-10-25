import { callTauri } from './tauri'
import type { DownloadProgress, InstallationPlan } from '../types'
import type { ReleaseAssetArchitecture } from '../features/library/releaseAssetClassifier'

export async function getInstallationArchitecture(): Promise<ReleaseAssetArchitecture> {
  return callTauri<ReleaseAssetArchitecture>('get_installation_architecture')
}

export async function planReleaseInstallation(owner: string, repo: string, tag: string): Promise<InstallationPlan> {
  return callTauri('plan_release_installation', { owner, repo, tag })
}

export async function startDownload(
  url: string,
  fileName: string,
  owner: string,
  repo: string,
  tag: string,
  size: number,
  preferExistingInstall = false,
): Promise<string> {
  return callTauri<string>('start_download', {
    url,
    fileName,
    owner,
    repo,
    tag,
    size,
    preferExistingInstall,
  })
}

export async function getDownloads(): Promise<DownloadProgress[]> {
  return callTauri<DownloadProgress[]>('get_downloads')
}

export async function cancelDownload(id: string): Promise<void> {
  return callTauri('cancel_download', { id })
}
