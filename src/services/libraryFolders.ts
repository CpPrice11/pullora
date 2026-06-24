import { callTauri } from './tauri'
import type { LibraryFolder } from '../types'

const fallbackStorageKey = 'pullora-library-folders-v1'

function isLibraryFolder(value: unknown): value is LibraryFolder {
  const folder = value as Partial<LibraryFolder>
  return typeof folder?.id === 'string' &&
    typeof folder?.name === 'string' &&
    Array.isArray(folder?.repoKeys)
}

function readFallbackFolders() {
  if (typeof window === 'undefined') return []

  try {
    const rawFolders = window.localStorage.getItem(fallbackStorageKey)
    if (!rawFolders) return []
    const parsed = JSON.parse(rawFolders) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isLibraryFolder)
  } catch {
    return []
  }
}

function writeFallbackFolders(folders: LibraryFolder[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(fallbackStorageKey, JSON.stringify(folders))
}

export async function getLibraryFolders(): Promise<LibraryFolder[]> {
  try {
    return await callTauri<LibraryFolder[]>('get_library_folders')
  } catch {
    return readFallbackFolders()
  }
}

export async function saveLibraryFolders(folders: LibraryFolder[]): Promise<LibraryFolder[]> {
  try {
    return await callTauri<LibraryFolder[]>('save_library_folders', { folders })
  } catch {
    writeFallbackFolders(folders)
    return folders
  }
}
