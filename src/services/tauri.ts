import { invoke } from '@tauri-apps/api/core'
import { translate, type AppLanguage } from '../i18n'

// Detect if running inside Tauri or in a plain browser (for dev preview)
const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
const errorPrefix = 'PULLORA_ERROR:'

export class TauriCommandError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly rawMessage: string,
  ) {
    super(message)
    this.name = 'TauriCommandError'
  }
}

function localizedCommandError(error: unknown) {
  const rawMessage = error instanceof Error ? error.message : String(error)
  const encodedCode = rawMessage.startsWith(errorPrefix)
    ? rawMessage.slice(errorPrefix.length).split('|', 1)[0]
    : null
  const code = encodedCode?.startsWith('errors.') ? encodedCode : 'errors.commandFailed'
  const language: AppLanguage = document.documentElement.lang === 'en' ? 'en' : 'uk'
  return new TauriCommandError(code, translate(language, code), rawMessage)
}

export function getLocalizedErrorMessage(error: unknown) {
  return localizedCommandError(error).message
}

export async function callTauri<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri) {
    throw localizedCommandError(`Tauri not available — command "${cmd}" cannot run in browser`)
  }
  try {
    return await invoke<T>(cmd, args)
  } catch (error) {
    throw localizedCommandError(error)
  }
}
