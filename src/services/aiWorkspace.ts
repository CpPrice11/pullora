import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { callTauri } from './tauri'
import type { AiWorkspace, CodexEventPayload, CodexRuntimeStatus } from '../types'

export async function listAiWorkspaces(): Promise<AiWorkspace[]> {
  return callTauri<AiWorkspace[]>('list_ai_workspaces')
}

export async function addAiWorkspace(path: string, linkedLibraryRepo?: string): Promise<AiWorkspace> {
  return callTauri<AiWorkspace>('add_ai_workspace', { path, linkedLibraryRepo })
}

export async function cloneAiWorkspace(githubUrl: string, linkedLibraryRepo?: string): Promise<AiWorkspace> {
  return callTauri<AiWorkspace>('clone_ai_workspace', { githubUrl, linkedLibraryRepo })
}

export async function touchAiWorkspace(id: string): Promise<AiWorkspace> {
  return callTauri<AiWorkspace>('touch_ai_workspace', { id })
}

export async function unlinkAiWorkspace(id: string): Promise<void> {
  return callTauri('unlink_ai_workspace', { id })
}

export async function deleteAiWorkspaceFiles(id: string): Promise<void> {
  return callTauri('delete_ai_workspace_files', { id, confirmed: true })
}

export async function getCodexRuntimeStatus(): Promise<CodexRuntimeStatus> {
  return callTauri<CodexRuntimeStatus>('get_codex_runtime_status')
}

export async function codexRequest<T = Record<string, unknown>>(
  method: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  return callTauri<T>('codex_request', { method, params })
}

export async function codexRespond(id: string | number, result: Record<string, unknown>): Promise<void> {
  return callTauri('codex_respond', { id, result })
}

export async function getCodexAccountStatus(): Promise<Record<string, unknown>> {
  return callTauri<Record<string, unknown>>('codex_account_status')
}

export async function loginCodexWithApiKey(apiKey: string): Promise<void> {
  return callTauri('codex_login_with_api_key', { apiKey })
}

export async function stopCodexRuntime(): Promise<void> {
  return callTauri('stop_codex_runtime')
}

export async function openCodexDesktop(path?: string): Promise<void> {
  return callTauri('open_codex_desktop', { path })
}

export function listenCodexEvents(
  onEvent: (payload: CodexEventPayload) => void,
  onFailure: (message: string) => void,
): Promise<UnlistenFn[]> {
  return Promise.all([
    listen<CodexEventPayload>('ai-workspace-codex-event', (event) => onEvent(event.payload)),
    listen<string>('ai-workspace-runtime-failure', (event) => onFailure(event.payload)),
  ])
}
