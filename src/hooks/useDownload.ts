import { useState, useCallback, useEffect, useRef } from 'react'
import { listen } from '@tauri-apps/api/event'
import type { DownloadProgress } from '../types'
import { startDownload, cancelDownload } from '../services/download'

export function useDownload() {
  const [downloads, setDownloads] = useState<DownloadProgress[]>([])
  const unlistenRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    // Listen for progress events emitted by Tauri backend
    listen<DownloadProgress>('download-progress', (event) => {
      setDownloads((prev) => {
        const idx = prev.findIndex((d) => d.id === event.payload.id)
        if (idx === -1) return [...prev, event.payload]
        const next = [...prev]
        next[idx] = event.payload
        return next
      })
    })
      .then((unlisten) => {
        unlistenRef.current = unlisten
      })
      .catch(() => {
        // Not running inside Tauri — no-op
      })

    return () => {
      unlistenRef.current?.()
    }
  }, [])

  const download = useCallback(
    async (
      url: string,
      fileName: string,
      owner: string,
      repo: string,
      tag: string,
    ): Promise<string | null> => {
      try {
        const id = await startDownload(url, fileName, owner, repo, tag)
        return id
      } catch (err) {
        console.error('Download failed:', err)
        return null
      }
    },
    [],
  )

  const cancel = useCallback(async (id: string) => {
    await cancelDownload(id)
    setDownloads((prev) => prev.filter((d) => d.id !== id))
  }, [])

  const activeDownloads = downloads.filter(
    (d) => d.status === 'downloading' || d.status === 'extracting' || d.status === 'pending',
  )
  const completedDownloads = downloads.filter((d) => d.status === 'completed')
  const failedDownloads = downloads.filter((d) => d.status === 'failed')

  return { downloads, activeDownloads, completedDownloads, failedDownloads, download, cancel }
}
