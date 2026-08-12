import { convertFileSrc } from '@tauri-apps/api/core'
import type { CSSProperties } from 'react'
import type { ArtCrop, ProjectArt } from '../types'
import { callTauri } from './tauri'

export type ProjectArtKind = 'cover' | 'background' | 'all'
const LAUNCHER_ART_OWNER = '__pullora__'
const LEGACY_LAUNCHER_ART_OWNER = '__air_launcher__'
const LAUNCHER_ART_REPO = 'global'
export type LauncherBackgroundTheme = 'light' | 'dark'

const DEFAULT_ART_CROP: ArtCrop = { focusX: 0.5, focusY: 0.5, zoom: 1 }

type ArtCropStyle = CSSProperties & {
  '--art-focus-x': string
  '--art-focus-y': string
  '--art-zoom': string
}

function launcherThemeRepo(theme: LauncherBackgroundTheme) {
  return `${LAUNCHER_ART_REPO}-${theme}`
}

export async function listProjectArt(): Promise<ProjectArt[]> {
  return callTauri<ProjectArt[]>('list_project_art_assets')
}

export async function getProjectArtPreview(sourcePath: string): Promise<string> {
  return callTauri<string>('get_project_art_preview', { sourcePath })
}

async function getProjectArt(owner: string, repo: string): Promise<ProjectArt | null> {
  return callTauri<ProjectArt | null>('get_project_art_asset', { owner, repo })
}

export async function setProjectArt(
  owner: string,
  repo: string,
  kind: Exclude<ProjectArtKind, 'all'>,
  sourcePath: string,
  crop?: ArtCrop,
): Promise<ProjectArt> {
  return callTauri<ProjectArt>('set_project_art_asset_command', {
    owner,
    repo,
    kind,
    sourcePath,
    crop,
  })
}

export async function setProjectArtCrop(
  owner: string,
  repo: string,
  kind: Exclude<ProjectArtKind, 'all'>,
  crop: ArtCrop,
): Promise<ProjectArt> {
  return callTauri<ProjectArt>('set_project_art_crop_command', { owner, repo, kind, crop })
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

export function artCropStyle(crop: ArtCrop = DEFAULT_ART_CROP): ArtCropStyle {
  const clamp = (value: number, min: number, max: number, fallback: number) =>
    Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback

  return {
    '--art-focus-x': `${clamp(crop.focusX, 0, 1, DEFAULT_ART_CROP.focusX) * 100}%`,
    '--art-focus-y': `${clamp(crop.focusY, 0, 1, DEFAULT_ART_CROP.focusY) * 100}%`,
    '--art-zoom': String(clamp(crop.zoom, 1, 4, DEFAULT_ART_CROP.zoom)),
  }
}

export function projectArtCropStyle(art?: ProjectArt | null): ArtCropStyle {
  return artCropStyle(art?.backgroundCrop)
}

export function projectArtCoverCropStyle(art?: ProjectArt | null): ArtCropStyle {
  return artCropStyle(art?.coverCrop)
}

export async function getLauncherBackgroundArt(theme: LauncherBackgroundTheme): Promise<ProjectArt | null> {
  return await getProjectArt(LAUNCHER_ART_OWNER, launcherThemeRepo(theme)) ??
    await getProjectArt(LAUNCHER_ART_OWNER, LAUNCHER_ART_REPO) ??
    getProjectArt(LEGACY_LAUNCHER_ART_OWNER, LAUNCHER_ART_REPO)
}

export async function setLauncherBackgroundArt(
  theme: LauncherBackgroundTheme,
  sourcePath: string,
  crop?: ArtCrop,
): Promise<ProjectArt> {
  return setProjectArt(LAUNCHER_ART_OWNER, launcherThemeRepo(theme), 'background', sourcePath, crop)
}

export async function clearLauncherBackgroundArt(theme: LauncherBackgroundTheme): Promise<ProjectArt> {
  return clearProjectArt(LAUNCHER_ART_OWNER, launcherThemeRepo(theme), 'background')
}
