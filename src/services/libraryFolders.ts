import { callTauri } from './tauri'
import type { LibraryFolder } from '../types'

export async function getLibraryFolders(): Promise<LibraryFolder[]> {
  return callTauri<LibraryFolder[]>('get_library_folders')
}

export async function saveLibraryFolders(folders: LibraryFolder[]): Promise<LibraryFolder[]> {
  return callTauri<LibraryFolder[]>('save_library_folders', { folders })
}
