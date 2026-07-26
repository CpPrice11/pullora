import { invoke } from '@tauri-apps/api/core'
import { translate, type AppLanguage } from '../i18n'
import { formatBytes } from '../utils/format'

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

function errorMessage(code: string, detail: string | null, language: AppLanguage) {
  if (code === 'errors.insufficientDiskSpace' && detail) {
    const [neededRaw, availableRaw] = detail.split(':')
    const needed = Number(neededRaw)
    const available = Number(availableRaw)
    if (Number.isFinite(needed) && Number.isFinite(available)) {
      return translate(language, code, {
        needed: formatBytes(needed, language),
        available: formatBytes(available, language),
      })
    }
  }

  return translate(language, code)
}

function localizedCommandError(error: unknown) {
  const rawMessage = error instanceof Error ? error.message : String(error)
  const encoded = rawMessage.startsWith(errorPrefix) ? rawMessage.slice(errorPrefix.length) : null
  const pipeIndex = encoded?.indexOf('|') ?? -1
  const encodedCode = encoded === null ? null : pipeIndex === -1 ? encoded : encoded.slice(0, pipeIndex)
  const detail = encoded !== null && pipeIndex !== -1 ? encoded.slice(pipeIndex + 1) : null
  const code = encodedCode?.startsWith('errors.') ? encodedCode : 'errors.commandFailed'
  const language: AppLanguage = document.documentElement.lang === 'en' ? 'en' : 'uk'
  return new TauriCommandError(code, errorMessage(code, detail, language), rawMessage)
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
