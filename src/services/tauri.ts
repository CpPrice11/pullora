import { invoke } from '@tauri-apps/api/core'

// Detect if running inside Tauri or in a plain browser (for dev preview)
const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export async function callTauri<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri) {
    throw new Error(`Tauri not available — command "${cmd}" cannot run in browser`)
  }
  return invoke<T>(cmd, args)
}
