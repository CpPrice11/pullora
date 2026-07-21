import { convertFileSrc } from '@tauri-apps/api/core'
import type { ProjectArt } from '../types'
import { callTauri } from './tauri'

export type ProjectArtKind = 'cover' | 'background' | 'all'
const LAUNCHER_ART_OWNER = '__pullora__'
const LEGACY_LAUNCHER_ART_OWNER = '__air_launcher__'
const LAUNCHER_ART_REPO = 'global'
export type LauncherBackgroundTheme = 'light' | 'dark'

function launcherThemeRepo(theme: LauncherBackgroundTheme) {
  return `${LAUNCHER_ART_REPO}-${theme}`
}

export async function listProjectArt(): Promise<ProjectArt[]> {
  return callTauri<ProjectArt[]>('list_project_art_assets')
}

async function getProjectArt(owner: string, repo: string): Promise<ProjectArt | null> {
  return callTauri<ProjectArt | null>('get_project_art_asset', { owner, repo })
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

function toProjectArtUrl(path?: string | null): string | null {
  if (!path) return null
  try {
    return convertFileSrc(path).replace(/\\/g, '/')
  } catch {
    return path.replace(/\\/g, '/')
  }
}

export function projectArtCoverUrl(art?: ProjectArt | null): string | null {
  return art?.coverDataUrl ?? toProjectArtUrl(art?.coverPath) ?? null
}

export function projectArtBackgroundUrl(
  art?: ProjectArt | null,
  options: { fallbackToCover?: boolean } = {},
): string | null {
  const backgroundUrl = art?.backgroundDataUrl ?? toProjectArtUrl(art?.backgroundPath) ?? null
  if (backgroundUrl) return backgroundUrl
  return options.fallbackToCover === false ? null : projectArtCoverUrl(art)
}

export async function getLauncherBackgroundArt(theme: LauncherBackgroundTheme): Promise<ProjectArt | null> {
  return await getProjectArt(LAUNCHER_ART_OWNER, launcherThemeRepo(theme)) ??
    await getProjectArt(LAUNCHER_ART_OWNER, LAUNCHER_ART_REPO) ??
    getProjectArt(LEGACY_LAUNCHER_ART_OWNER, LAUNCHER_ART_REPO)
}

export async function setLauncherBackgroundArt(
  theme: LauncherBackgroundTheme,
  sourcePath: string,
): Promise<ProjectArt> {
  return setProjectArt(LAUNCHER_ART_OWNER, launcherThemeRepo(theme), 'background', sourcePath)
}

export async function clearLauncherBackgroundArt(theme: LauncherBackgroundTheme): Promise<ProjectArt> {
  return clearProjectArt(LAUNCHER_ART_OWNER, launcherThemeRepo(theme), 'background')
}
