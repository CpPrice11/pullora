import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { focusFirstMenuItem, handleMenuKeyboard } from '../../utils/menuKeyboard'
import { useOverlayPosition, type OverlayAnchor } from './useOverlayPosition'

interface UiMenuProps {
  open: boolean
  anchor: OverlayAnchor | null
  ariaLabel: string
  children: ReactNode
  onClose: () => void
  triggerRef?: { current: HTMLElement | null }
  className?: string
}

export default function UiMenu({
  open,
  anchor,
  ariaLabel,
  children,
  onClose,
  triggerRef,
  className = '',
}: UiMenuProps) {
  const menuId = useId()
  const menuRef = useRef<HTMLDivElement>(null)
  const style = useOverlayPosition(open, menuRef, anchor)

  useEffect(() => {
    if (!open) return
    const trigger = triggerRef?.current ?? (anchor instanceof HTMLElement ? anchor : null)
    trigger?.setAttribute('aria-controls', menuId)
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node
      const anchorElement = anchor instanceof HTMLElement ? anchor : null
      if (
        !menuRef.current?.contains(target)
        && !triggerRef?.current?.contains(target)
        && !anchorElement?.contains(target)
      ) onClose()
    }
    document.addEventListener('pointerdown', closeOutside)
    const frame = window.requestAnimationFrame(() => focusFirstMenuItem(menuRef.current))
    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('pointerdown', closeOutside)
      trigger?.removeAttribute('aria-controls')
    }
  }, [anchor, menuId, onClose, open, triggerRef])

  if (!open || !anchor) return null

  return createPortal(
    <div
      id={menuId}
      ref={menuRef}
      className={`ui-menu ${className}`.trim()}
      role="menu"
      aria-orientation="vertical"
      aria-label={ariaLabel}
      style={style}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => handleMenuKeyboard(event, () => {
        onClose()
        ;(triggerRef?.current ?? (anchor instanceof HTMLElement ? anchor : null))?.focus()
      })}
    >
      {children}
    </div>,
    document.body,
  )
}

export function UiMenuSeparator() {
  return <div className="ui-menu-separator" role="separator" />
}
