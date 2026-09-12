import { useEffect, useState } from 'react'

const TOAST_EXIT_MS = 180

export function useToastPresence(value: string | null) {
  const [message, setMessage] = useState(value)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (value) {
      setMessage(value)
      const frame = window.requestAnimationFrame(() => setVisible(true))
      return () => window.cancelAnimationFrame(frame)
    }

    setVisible(false)
    const timer = window.setTimeout(() => setMessage(null), TOAST_EXIT_MS)
    return () => window.clearTimeout(timer)
  }, [value])

  return { message, visible }
}
