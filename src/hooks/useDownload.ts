import { useState, useCallback, useEffect, useRef } from 'react'
import { listen } from '@tauri-apps/api/event'
import type { DownloadProgress } from '../types'
import { startDownload, getDownloads, cancelDownload } from '../services/download'

function mergeDownloads(existing: DownloadProgress[], incoming: DownloadProgress[]) {
  const byId = new Map(existing.map((item) => [item.id, item]))
  incoming.forEach((item) => byId.set(item.id, item))
  return [...byId.values()]
}

export function useDownload() {
  const [downloads, setDownloads] = useState<DownloadProgress[]>([])
  const unlistenRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    let active = true

    getDownloads()
      .then((items) => {
        if (active) {
          setDownloads((previous) => mergeDownloads(items, previous))
        }
      })
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
      installPath?: string,
    ): Promise<string> => {
      return startDownload(url, fileName, owner, repo, tag, installPath)
    },
    [],
  )

  const cancel = useCallback(async (id: string) => {
    await cancelDownload(id)
    setDownloads((prev) => prev.filter((d) => d.id !== id))
  }, [])

  return { downloads, download, cancel }
}
