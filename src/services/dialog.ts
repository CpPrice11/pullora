// Tauri dialog plugin wrapper — falls back gracefully in browser
let dialogApi: typeof import('@tauri-apps/plugin-dialog') | null = null

async function getDialogApi() {
  if (dialogApi) return dialogApi
  try {
    dialogApi = await import('@tauri-apps/plugin-dialog')
    return dialogApi
  } catch {
    return null
  }
}

export async function pickDirectory(): Promise<string | null> {
  const api = await getDialogApi()
  if (!api) return null
  const result = await api.open({ directory: true, multiple: false })
  if (!result) return null
  return typeof result === 'string' ? result : null
}

export async function pickImageFile(): Promise<string | null> {
  const api = await getDialogApi()
  if (!api) return null
  const result = await api.open({
    directory: false,
    multiple: false,
    filters: [
      {
        name: 'Images',
        extensions: ['png', 'jpg', 'jpeg', 'webp'],
      },
    ],
  })
  if (!result) return null
  return typeof result === 'string' ? result : null
}

export async function pickJsonFile(): Promise<string | null> {
  const api = await getDialogApi()
  if (!api) return null
  const result = await api.open({
    directory: false,
    multiple: false,
    filters: [
      {
        name: 'JSON',
        extensions: ['json'],
      },
    ],
  })
  if (!result) return null
  return typeof result === 'string' ? result : null
}

export async function pickJsonSavePath(defaultPath = 'pullora-installed-registry.json'): Promise<string | null> {
  const api = await getDialogApi()
  if (!api) return null
  const result = await api.save({
    defaultPath,
    filters: [
      {
        name: 'JSON',
        extensions: ['json'],
      },
    ],
  })
  return typeof result === 'string' ? result : null
}
