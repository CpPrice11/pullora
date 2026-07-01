import type { AppSettings } from '../types'
import { APPEARANCE_PRESETS, normalizeAppearance } from './settingsDefaults'

export type ThemePreference = AppSettings['theme']
type ResolvedTheme = 'light' | 'dark'

export const THEME_CHANGE_EVENT = 'pullora-theme-change'

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

const CUSTOM_THEME_STYLE_ID = 'pullora-custom-theme'

export function appearanceCssVariables(appearance: AppSettings['appearance'] | undefined) {
  const normalized = normalizeAppearance(appearance)
  const densityScale = normalized.density === 'compact' ? 0.86 : normalized.density === 'spacious' ? 1.12 : 1

  return {
    '--color-primary': normalized.accent,
    '--color-primary-dark': normalized.accentHover,
    '--color-primary-light': `${normalized.accent}24`,
    '--color-bg': `color-mix(in srgb, ${normalized.background} 58%, transparent)`,
    '--color-bg-elevated': `color-mix(in srgb, ${normalized.surface} 52%, transparent)`,
    '--color-bg-secondary': `color-mix(in srgb, ${normalized.surface2} 42%, transparent)`,
    '--color-mica': `color-mix(in srgb, ${normalized.surface} 42%, transparent)`,
    '--color-sidebar': `color-mix(in srgb, ${normalized.sidebar} 48%, transparent)`,
    '--color-control': `color-mix(in srgb, ${normalized.surface2} 34%, transparent)`,
    '--color-control-hover': `color-mix(in srgb, ${normalized.surface2} 52%, transparent)`,
    '--color-text': normalized.text,
    '--color-text-secondary': normalized.muted,
    '--color-text-tertiary': `${normalized.muted}cc`,
    '--color-border': normalized.border,
    '--color-border-subtle': `${normalized.border}99`,
    '--font-family': normalized.fontFamily,
    '--font-size-base': `${normalized.fontSize}px`,
    '--border-radius': `${normalized.radius}px`,
    '--border-radius-lg': `${normalized.radius + 6}px`,
    '--density-scale': String(densityScale),
    '--material-mica': `color-mix(in srgb, ${normalized.surface} 38%, transparent)`,
    '--material-mica-strong': `color-mix(in srgb, ${normalized.surface} 52%, transparent)`,
    '--material-acrylic': `linear-gradient(180deg, rgba(255, 255, 255, 0.095), rgba(255, 255, 255, 0.024)), color-mix(in srgb, ${normalized.surface} 36%, transparent)`,
    '--material-acrylic-strong': `linear-gradient(180deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.034)), color-mix(in srgb, ${normalized.surface} 50%, transparent)`,
    '--material-acrylic-subtle': `linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.014)), color-mix(in srgb, ${normalized.surface} 24%, transparent)`,
    '--material-border': `color-mix(in srgb, ${normalized.border} 58%, transparent)`,
    '--material-border-strong': `color-mix(in srgb, ${normalized.border} 78%, transparent)`,
  }
}

export function appearanceCssText(appearance: AppSettings['appearance'] | undefined) {
  const variables = appearanceCssVariables(appearance)
  return `:root {\n${Object.entries(variables)
    .map(([key, value]) => `  ${key}: ${value};`)
    .join('\n')}\n}`
}

export function applyAppearanceSettings(appearance: AppSettings['appearance'] | undefined) {
  const root = document.documentElement
  const normalized = normalizeAppearance(appearance)
  const effectiveAppearance = normalized.preset === 'custom'
    ? normalized
    : APPEARANCE_PRESETS[normalized.preset]
  const variables = appearanceCssVariables(effectiveAppearance)

  Object.entries(variables).forEach(([key, value]) => root.style.setProperty(key, value))
  root.dataset.appearancePreset = normalized.preset

  let style = document.getElementById(CUSTOM_THEME_STYLE_ID) as HTMLStyleElement | null
  if (!style) {
    style = document.createElement('style')
    style.id = CUSTOM_THEME_STYLE_ID
    document.head.appendChild(style)
  }
  style.textContent = effectiveAppearance.customCss
}
