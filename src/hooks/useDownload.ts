import { useState, useCallback, useEffect, useRef } from 'react'
import { listen } from '@tauri-apps/api/event'
import type { DownloadProgress } from '../types'
import { startDownload, getDownloads, cancelDownload, setDownloadPaused } from '../services/download'

function mergeDownloads(existing: DownloadProgress[], incoming: DownloadProgress[]) {
  const byId = new Map(existing.map((item) => [item.id, item]))
  incoming.forEach((item) => byId.set(item.id, item))
  return [...byId.values()]
}

export function useDownload() {
  const [downloads, setDownloads] = useState<DownloadProgress[]>([])
  const unlistenRef = useRef<(() => void) | null>(null)

  const refresh = useCallback(async () => {
    setDownloads(await getDownloads())
  }, [])

  useEffect(() => {
    let active = true

    getDownloads()
      .then((items) => active && setDownloads((previous) => mergeDownloads(items, previous)))
      .catch(() => {})

    listen<DownloadProgress>('download-progress', (event) => {
      setDownloads((previous) => mergeDownloads(previous, [event.payload]))
    })
      .then((unlisten) => {
        if (!active) {
          unlisten()
          return
        }
        unlistenRef.current = unlisten
      })
      .catch(() => {})

    return () => {
      active = false
      unlistenRef.current?.()
      unlistenRef.current = null
    }
  }, [])

  const download = useCallback(
    async (
      url: string,
      fileName: string,
      owner: string,
      repo: string,
      tag: string,
      size: number,
      preferExistingInstall = false,
    ): Promise<string> => {
      const id = await startDownload(url, fileName, owner, repo, tag, size, preferExistingInstall)
      // The initial progress event may arrive before this listener is attached.
      // Preserve events received while the snapshot request was in flight.
      await getDownloads().then((items) => setDownloads((previous) => mergeDownloads(items, previous))).catch(() => {})
      return id
    },
    [],
  )

  const cancel = useCallback(async (id: string) => {
    await cancelDownload(id)
    setDownloads((prev) => prev.filter((d) => d.id !== id))
  }, [])

  const setPaused = useCallback(async (id: string, paused: boolean) => {
    await setDownloadPaused(id, paused)
    await refresh()
  }, [refresh])

  return { downloads, download, cancel, refresh, setPaused }
}
