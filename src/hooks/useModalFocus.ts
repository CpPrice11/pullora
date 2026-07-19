import { useEffect, useRef, type RefObject } from 'react'

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function getFocusableElements(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>(focusableSelector)).filter((element) => {
    const ariaHidden = element.getAttribute('aria-hidden') === 'true'
    return !ariaHidden && !element.hasAttribute('hidden')
  })
}

interface UseModalFocusOptions {
  active?: boolean
  onEscape?: () => void
  returnFocusRef?: RefObject<HTMLElement>
}

export function useModalFocus(
  containerRef: RefObject<HTMLElement>,
  { active = true, onEscape, returnFocusRef }: UseModalFocusOptions = {},
) {
  const onEscapeRef = useRef(onEscape)

  useEffect(() => {
    onEscapeRef.current = onEscape
  }, [onEscape])

  useEffect(() => {
    const container = containerRef.current
    if (!active || !container) return

    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null

    const focusTimer = window.setTimeout(() => {
      const preferredFocusable = container.querySelector<HTMLElement>('[data-autofocus="true"]')
      const firstFocusable = getFocusableElements(container)[0]
      ;(preferredFocusable ?? firstFocusable ?? container).focus()
    }, 0)

    const handleKeyDown = (event: KeyboardEvent) => {
      const escapeHandler = onEscapeRef.current
      if (event.key === 'Escape' && escapeHandler) {
        event.preventDefault()
        escapeHandler()
        return
      }

      if (event.key !== 'Tab') return

      const focusableElements = getFocusableElements(container)
      if (focusableElements.length === 0) {
        event.preventDefault()
        container.focus()
        return
      }

      const firstElement = focusableElements[0]
      const lastElement = focusableElements[focusableElements.length - 1]
      const activeElement = document.activeElement

      if (event.shiftKey && activeElement === firstElement) {
        event.preventDefault()
        lastElement.focus()
        return
      }

      if (!event.shiftKey && activeElement === lastElement) {
        event.preventDefault()
        firstElement.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      window.clearTimeout(focusTimer)
      document.removeEventListener('keydown', handleKeyDown)

      const focusTarget = returnFocusRef?.current ?? previousFocus
      if (focusTarget && document.contains(focusTarget)) {
        focusTarget.focus()
      }
    }
  }, [active, containerRef, returnFocusRef])
}
