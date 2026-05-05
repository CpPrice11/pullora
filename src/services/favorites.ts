import { callTauri } from './tauri'
import type { FavoriteApp } from '../types'

export async function getFavorites(): Promise<FavoriteApp[]> {
  return callTauri<FavoriteApp[]>('get_favorites')
}

export async function addToFavorites(
  owner: string,
  repo: string,
  displayName: string,
  description?: string,
): Promise<void> {
  return callTauri('add_to_favorites', { owner, repo, displayName, description })
}

export async function removeFromFavorites(owner: string, repo: string): Promise<void> {
  return callTauri('remove_from_favorites', { owner, repo })
}

export async function checkIsFavorite(owner: string, repo: string): Promise<boolean> {
  return callTauri<boolean>('check_is_favorite', { owner, repo })
}
