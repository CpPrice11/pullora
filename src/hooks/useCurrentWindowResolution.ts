import { useEffect, useState } from 'react'

export type WindowResolution = { width: number; height: number }

const readWindowResolution = (): WindowResolution => {
  if (typeof window === 'undefined') return { width: 1280, height: 720 }
  return {
    width: Math.max(1, Math.round(window.innerWidth)),
    height: Math.max(1, Math.round(window.innerHeight)),
  }
}

export function useCurrentWindowResolution(enabled = true) {
  const [resolution, setResolution] = useState(readWindowResolution)

  useEffect(() => {
    if (!enabled) return
    const sync = () => setResolution(readWindowResolution())
    sync()
    window.addEventListener('resize', sync)
    return () => window.removeEventListener('resize', sync)
  }, [enabled])

  return resolution
}
