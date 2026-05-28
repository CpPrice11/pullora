import type { AppSettings } from '../types'
import { normalizeAppearance } from './settingsDefaults'

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

const CUSTOM_THEME_STYLE_ID = 'air-launcher-custom-theme'

export function applyAppearanceSettings(appearance: AppSettings['appearance'] | undefined) {
  const root = document.documentElement
  const normalized = normalizeAppearance(appearance)
  const densityScale = normalized.density === 'compact' ? 0.86 : normalized.density === 'spacious' ? 1.12 : 1

  root.style.setProperty('--color-primary', normalized.accent)
  root.style.setProperty('--color-primary-dark', normalized.accentHover)
  root.style.setProperty('--color-primary-light', `${normalized.accent}24`)
  root.style.setProperty('--color-accent-wash', `${normalized.accent}1f`)
  root.style.setProperty('--color-bg', normalized.background)
  root.style.setProperty('--color-bg-elevated', normalized.surface)
  root.style.setProperty('--color-bg-secondary', normalized.surface2)
  root.style.setProperty('--color-mica', `${normalized.surface}d9`)
  root.style.setProperty('--color-sidebar', normalized.sidebar)
  root.style.setProperty('--color-control', `${normalized.surface2}cc`)
  root.style.setProperty('--color-control-hover', normalized.surface2)
  root.style.setProperty('--color-nav-active', `${normalized.accent}1f`)
  root.style.setProperty('--color-text', normalized.text)
  root.style.setProperty('--color-text-secondary', normalized.muted)
  root.style.setProperty('--color-text-tertiary', `${normalized.muted}cc`)
  root.style.setProperty('--color-border', normalized.border)
  root.style.setProperty('--color-border-subtle', `${normalized.border}99`)
  root.style.setProperty('--font-family', normalized.fontFamily)
  root.style.setProperty('--font-size-base', `${normalized.fontSize}px`)
  root.style.setProperty('--border-radius', `${normalized.radius}px`)
  root.style.setProperty('--border-radius-lg', `${normalized.radius + 6}px`)
  root.style.setProperty('--density-scale', String(densityScale))
  root.dataset.appearancePreset = normalized.preset

  let style = document.getElementById(CUSTOM_THEME_STYLE_ID) as HTMLStyleElement | null
  if (!style) {
    style = document.createElement('style')
    style.id = CUSTOM_THEME_STYLE_ID
    document.head.appendChild(style)
  }
  style.textContent = normalized.customCss
}
