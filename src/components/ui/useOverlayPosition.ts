import { useEffect, useState, type CSSProperties, type RefObject } from 'react'

export type OverlayAnchor = HTMLElement | { x: number; y: number }

export function useOverlayPosition<T extends HTMLElement>(
  open: boolean,
  overlayRef: RefObject<T>,
  anchor: OverlayAnchor | null,
  matchWidth = false,
) {
  const [style, setStyle] = useState<CSSProperties>({ visibility: 'hidden' })

  useEffect(() => {
    if (!open || !anchor || !overlayRef.current) return

    const update = () => {
      const overlay = overlayRef.current
      if (!overlay) return
      const isPoint = !(anchor instanceof HTMLElement)
      const bounds = isPoint
        ? { left: anchor.x, top: anchor.y, right: anchor.x, bottom: anchor.y, width: 0 }
        : anchor.getBoundingClientRect()
      const margin = 8
      const gap = 6
      const width = Math.max(matchWidth ? bounds.width : 0, overlay.offsetWidth)
      const height = overlay.offsetHeight
      const roomBelow = window.innerHeight - bounds.bottom - margin
      const openAbove = height > roomBelow && bounds.top > roomBelow
      const top = openAbove ? bounds.top - height - gap : bounds.bottom + gap
      const left = Math.min(Math.max(margin, bounds.left), window.innerWidth - width - margin)

      setStyle({
        left: Math.max(margin, left),
        maxHeight: Math.max(144, (openAbove ? bounds.top : roomBelow) - gap),
        minWidth: matchWidth ? bounds.width : undefined,
        top: Math.max(margin, Math.min(top, window.innerHeight - height - margin)),
        visibility: 'visible',
      })
    }

    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [anchor, matchWidth, open, overlayRef])

  return style
}
