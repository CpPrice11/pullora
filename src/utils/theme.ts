import type { AppSettings } from '../types'

export type ThemePreference = AppSettings['theme']
export type ResolvedTheme = 'light' | 'dark'

export const THEME_CHANGE_EVENT = 'air-launcher-theme-change'

export function resolveThemePreference(theme: ThemePreference): ResolvedTheme {
  if (theme === 'auto') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }

  return theme
}

export function applyThemePreference(theme: ThemePreference, animate = false) {
  const root = document.documentElement
  const resolvedTheme = resolveThemePreference(theme)

  if (animate) {
    root.classList.add('theme-transition')
    window.setTimeout(() => root.classList.remove('theme-transition'), 280)
  }

  root.dataset.theme = resolvedTheme
  root.dataset.themePreference = theme
}

export function notifyThemePreference(theme: ThemePreference) {
  window.dispatchEvent(
    new CustomEvent<{ theme: ThemePreference }>(THEME_CHANGE_EVENT, {
      detail: { theme },
    }),
  )
}
