// Tauri dialog plugin wrapper — falls back gracefully in browser
async function getDialogApi() {
  try {
    return await import('@tauri-apps/plugin-dialog')
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
