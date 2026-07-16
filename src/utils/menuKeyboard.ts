import type { KeyboardEvent as ReactKeyboardEvent } from 'react'

type MenuNavigationKey = 'ArrowDown' | 'ArrowUp' | 'Home' | 'End'

export function nextMenuItemIndex(
  key: MenuNavigationKey,
  currentIndex: number,
  itemCount: number,
) {
  if (itemCount === 0) return -1
  if (key === 'Home') return 0
  if (key === 'End') return itemCount - 1
  if (key === 'ArrowUp') return currentIndex <= 0 ? itemCount - 1 : currentIndex - 1
  return currentIndex < 0 || currentIndex >= itemCount - 1 ? 0 : currentIndex + 1
}

function menuItems(menu: HTMLElement) {
  return Array.from(
    menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'),
  ).filter((item) => item.closest('[role="menu"]') === menu)
}

export function focusFirstMenuItem(menu: HTMLElement | null) {
  menu && menuItems(menu)[0]?.focus()
}

export function handleMenuKeyboard(
  event: ReactKeyboardEvent<HTMLElement>,
  onEscape: () => void,
) {
  const activeItem = document.activeElement instanceof HTMLButtonElement
    ? document.activeElement
    : null
  const rootMenu = event.currentTarget
  const activeMenu = activeItem?.closest<HTMLElement>('[role="menu"]') ?? rootMenu

  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    onEscape()
    return
  }

  if (event.key === 'ArrowRight' && activeItem?.getAttribute('aria-haspopup') === 'menu') {
    event.preventDefault()
    if (activeItem.getAttribute('aria-expanded') !== 'true') activeItem.click()
    window.requestAnimationFrame(() => {
      focusFirstMenuItem(activeItem.parentElement?.querySelector<HTMLElement>(':scope > [role="menu"]') ?? null)
    })
    return
  }

  if (event.key === 'ArrowLeft' && activeMenu !== rootMenu) {
    event.preventDefault()
    const trigger = activeMenu.parentElement?.querySelector<HTMLButtonElement>(':scope > [aria-haspopup="menu"]')
    if (trigger?.getAttribute('aria-expanded') === 'true') trigger.click()
    trigger?.focus()
    return
  }

  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
  const items = menuItems(activeMenu)
  const nextIndex = nextMenuItemIndex(
    event.key as MenuNavigationKey,
    items.indexOf(activeItem as HTMLButtonElement),
    items.length,
  )
  if (nextIndex < 0) return

  event.preventDefault()
  items[nextIndex]?.focus()
}
