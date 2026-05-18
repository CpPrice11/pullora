import { convertFileSrc } from '@tauri-apps/api/core'
import type { ProjectArt } from '../types'
import { callTauri } from './tauri'

export type ProjectArtKind = 'cover' | 'background' | 'all'

export async function listProjectArt(): Promise<ProjectArt[]> {
  try {
    return await callTauri<ProjectArt[]>('list_project_art_assets')
  } catch {
    return []
  }
}

export async function getProjectArt(owner: string, repo: string): Promise<ProjectArt | null> {
  try {
    return await callTauri<ProjectArt | null>('get_project_art_asset', { owner, repo })
  } catch {
    return null
  }
}

export async function setProjectArt(
  owner: string,
  repo: string,
  kind: Exclude<ProjectArtKind, 'all'>,
  sourcePath: string,
): Promise<ProjectArt> {
  return callTauri<ProjectArt>('set_project_art_asset_command', {
    owner,
    repo,
    kind,
    sourcePath,
  })
}

export async function clearProjectArt(
  owner: string,
  repo: string,
  kind: ProjectArtKind,
): Promise<ProjectArt> {
  return callTauri<ProjectArt>('clear_project_art_asset_command', { owner, repo, kind })
}

export function projectArtKey(owner: string, repo: string) {
  return `${owner.toLowerCase()}/${repo.toLowerCase()}`
}

export function toProjectArtUrl(path?: string | null): string | null {
  if (!path) return null
  try {
    return convertFileSrc(path).replace(/\\/g, '/')
  } catch {
    return path.replace(/\\/g, '/')
  }
}

export function projectArtCoverUrl(art?: ProjectArt | null): string | null {
  return toProjectArtUrl(art?.coverPath) ?? art?.coverDataUrl ?? null
}

export function projectArtBackgroundUrl(art?: ProjectArt | null): string | null {
  return toProjectArtUrl(art?.backgroundPath) ?? art?.backgroundDataUrl ?? projectArtCoverUrl(art)
}
