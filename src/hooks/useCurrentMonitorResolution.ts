import { useEffect, useState } from 'react'

export type MonitorResolution = { width: number; height: number }

const displayDimension = (value: number) => {
  const roundedToTen = Math.round(value / 10) * 10
  return Math.abs(value - roundedToTen) <= 1 ? roundedToTen : Math.round(value)
}

const browserScreenResolution = (): MonitorResolution => {
  if (typeof window === 'undefined') return { width: 1920, height: 1080 }
  const scale = window.devicePixelRatio || 1
  return {
    width: displayDimension(window.screen.width * scale),
    height: displayDimension(window.screen.height * scale),
  }
}

const currentMonitorResolution = async (): Promise<MonitorResolution> => {
  try {
    const { currentMonitor } = await import('@tauri-apps/api/window')
    const monitor = await currentMonitor()
    if (monitor) {
      return {
        width: displayDimension(monitor.size.width),
        height: displayDimension(monitor.size.height),
      }
    }
  } catch {
    // Browser previews and older runtimes use the active web screen.
  }
  return browserScreenResolution()
}

export function useCurrentMonitorResolution(enabled = true) {
  const [resolution, setResolution] = useState(browserScreenResolution)

  useEffect(() => {
    if (!enabled) return
    let active = true
    let unlisten: (() => void) | undefined
    let timer: number | undefined

    const sync = async () => {
      const next = await currentMonitorResolution()
      if (active) setResolution(next)
    }
    const scheduleSync = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => void sync(), 120)
    }

    void sync()
    void import('@tauri-apps/api/window')
      .then(({ getCurrentWindow }) => getCurrentWindow().onMoved(scheduleSync))
      .then((stopListening) => {
        if (active) unlisten = stopListening
        else stopListening()
      })
      .catch(() => undefined)
    window.addEventListener('resize', scheduleSync)

    return () => {
      active = false
      window.clearTimeout(timer)
      unlisten?.()
      window.removeEventListener('resize', scheduleSync)
    }
  }, [enabled])

  return resolution
}
