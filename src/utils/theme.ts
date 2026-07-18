import type { AppSettings } from '../types'
import { APPEARANCE_PRESETS, normalizeAppearance } from './settingsDefaults'

export type ThemePreference = AppSettings['theme']
export type ResolvedTheme = 'light' | 'dark'

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
  return resolvedTheme
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
  const isLight = normalized.preset === 'githubLight'
  const densityScale = normalized.density === 'compact' ? 0.86 : normalized.density === 'spacious' ? 1.12 : 1
  const surfaceOpacity = 100 - normalized.surfaceTransparency
  const shellOpacity = isLight ? Math.min(92, surfaceOpacity + 8) : surfaceOpacity
  const nestedOpacity = Math.round(shellOpacity * (isLight ? 0.68 : 0.55))
  const insetOpacity = Math.round(shellOpacity * (isLight ? 0.82 : 0.72))
  const strongOpacity = Math.min(100, shellOpacity + 12)
  const backgroundScrimOpacity = Math.max(
    isLight ? 34 : 28,
    Math.min(isLight ? 70 : 66, shellOpacity - 8),
  )

  return {
    '--color-primary': normalized.accent,
    '--color-primary-dark': normalized.accentHover,
    '--color-primary-light': `${normalized.accent}24`,
    '--color-bg': isLight ? normalized.background : `color-mix(in srgb, ${normalized.background} 58%, transparent)`,
    '--color-bg-elevated': isLight ? normalized.surface : `color-mix(in srgb, ${normalized.surface} 52%, transparent)`,
    '--color-bg-secondary': isLight ? normalized.surface2 : `color-mix(in srgb, ${normalized.surface2} 42%, transparent)`,
    '--color-mica': isLight ? `color-mix(in srgb, ${normalized.surface} 94%, transparent)` : `color-mix(in srgb, ${normalized.surface} 42%, transparent)`,
    '--color-sidebar': isLight ? `color-mix(in srgb, ${normalized.sidebar} 94%, transparent)` : `color-mix(in srgb, ${normalized.sidebar} 48%, transparent)`,
    '--color-control': isLight ? normalized.surface : `color-mix(in srgb, ${normalized.surface2} 34%, transparent)`,
    '--color-control-hover': isLight ? normalized.surface2 : `color-mix(in srgb, ${normalized.surface2} 52%, transparent)`,
    '--color-text': normalized.text,
    '--color-text-secondary': normalized.muted,
    '--color-text-tertiary': isLight ? normalized.muted : `${normalized.muted}cc`,
    '--color-border': normalized.border,
    '--color-border-subtle': isLight ? normalized.border : `${normalized.border}99`,
    '--font-family': normalized.fontFamily,
    '--font-size-base': `${normalized.fontSize}px`,
    '--border-radius': `${normalized.radius}px`,
    '--border-radius-lg': `${normalized.radius + 6}px`,
    '--density-scale': String(densityScale),
    '--surface-opacity': `${surfaceOpacity}%`,
    '--surface-opacity-strong': `${strongOpacity}%`,
    '--surface-blur': `${normalized.surfaceBlur}px`,
    '--surface-canvas': normalized.background,
    '--launcher-background-scrim': `color-mix(in srgb, ${normalized.background} ${backgroundScrimOpacity}%, transparent)`,
    '--surface-1': `color-mix(in srgb, ${normalized.surface} ${shellOpacity}%, transparent)`,
    '--surface-2': `color-mix(in srgb, ${normalized.surface2} ${nestedOpacity}%, transparent)`,
    '--surface-3': `color-mix(in srgb, ${normalized.background} ${insetOpacity}%, transparent)`,
    '--surface-border': `color-mix(in srgb, ${normalized.border} ${isLight ? 82 : 58}%, transparent)`,
    '--surface-border-strong': `color-mix(in srgb, ${normalized.border} ${isLight ? 100 : 78}%, transparent)`,
    '--surface-shadow': isLight
      ? `0 18px 48px color-mix(in srgb, ${normalized.border} 24%, transparent)`
      : `0 18px 48px color-mix(in srgb, ${normalized.background} 58%, transparent)`,
    '--surface-material': 'var(--surface-1)',
    '--surface-material-strong': `color-mix(in srgb, ${normalized.surface} ${strongOpacity}%, transparent)`,
    '--material-mica': 'var(--surface-1)',
    '--material-mica-strong': 'var(--surface-material-strong)',
    '--material-acrylic': 'linear-gradient(180deg, rgba(255, 255, 255, 0.095), rgba(255, 255, 255, 0.024)), var(--surface-1)',
    '--material-acrylic-strong': 'linear-gradient(180deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.034)), var(--surface-material-strong)',
    '--material-acrylic-subtle': 'linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.014)), var(--surface-2)',
    '--material-border': 'var(--surface-border)',
    '--material-border-strong': 'var(--surface-border-strong)',
  }
}

export function appearanceCssText(appearance: AppSettings['appearance'] | undefined) {
  const variables = appearanceCssVariables(appearance)
  return `:root {\n${Object.entries(variables)
    .map(([key, value]) => `  ${key}: ${value};`)
    .join('\n')}\n}`
}

export function applyAppearanceSettings(
  appearance: AppSettings['appearance'] | undefined,
  theme: ResolvedTheme = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark',
) {
  const root = document.documentElement
  const normalized = normalizeAppearance(appearance)
  const themeAppearance = theme === 'light'
    ? APPEARANCE_PRESETS.githubLight
    : normalized.preset === 'custom'
      ? normalized
      : normalized.preset === 'githubLight'
        ? APPEARANCE_PRESETS.github
        : APPEARANCE_PRESETS[normalized.preset]
  const effectiveAppearance = {
    ...themeAppearance,
    density: normalized.density,
    surfaceTransparency: normalized.surfaceTransparency,
    surfaceBlur: normalized.surfaceBlur,
  }
  const variables = appearanceCssVariables(effectiveAppearance)

  Object.entries(variables).forEach(([key, value]) => root.style.setProperty(key, value))
  root.dataset.appearancePreset = effectiveAppearance.preset

  let style = document.getElementById(CUSTOM_THEME_STYLE_ID) as HTMLStyleElement | null
  if (!style) {
    style = document.createElement('style')
    style.id = CUSTOM_THEME_STYLE_ID
    document.head.appendChild(style)
  }
  style.textContent = effectiveAppearance.customCss
}
