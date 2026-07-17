import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/utils/settingsDefaults.ts', import.meta.url), 'utf8')
const presets = [...source.matchAll(/^  (\w+): \{\r?\n([\s\S]*?)^  \},?$/gm)]
const surfaces = ['background', 'surface', 'surface2', 'sidebar']
const foregrounds = { text: 4.5, muted: 4.5, accent: 3, accentHover: 3 }

if (presets.length === 0) throw new Error('No appearance presets found')

function luminance(hex) {
  const channels = hex.slice(1).match(/../g).map((value) => {
    const channel = Number.parseInt(value, 16) / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

function contrast(first, second) {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a)
  return (lighter + 0.05) / (darker + 0.05)
}

const failures = []
let checks = 0
let lightColors

for (const [, preset, body] of presets) {
  const colors = Object.fromEntries(
    [...body.matchAll(/^    (\w+): '(#[0-9a-f]{6})',?$/gim)].map((match) => [match[1], match[2]]),
  )

  if (preset === 'githubLight') lightColors = colors

  for (const surface of surfaces) {
    for (const [foreground, minimum] of Object.entries(foregrounds)) {
      const ratio = contrast(colors[foreground], colors[surface])
      checks += 1
      if (ratio < minimum) failures.push(`${preset}: ${foreground}/${surface} ${ratio.toFixed(2)}:1 < ${minimum}:1`)
    }
  }

  const isLight = preset === 'githubLight'
  const semanticColors = isLight
    ? { success: '#0b6a0b', error: '#b42318', warning: '#8a5d00' }
    : { success: '#79d983', error: '#ff9aaa', warning: '#e7bd45' }
  for (const surface of surfaces) {
    for (const [name, color] of Object.entries(semanticColors)) {
      const ratio = contrast(color, colors[surface])
      checks += 1
      if (ratio < 4.5) failures.push(`${preset}: ${name}/${surface} ${ratio.toFixed(2)}:1 < 4.5:1`)
    }
  }

  const onPrimary = isLight ? '#ffffff' : '#041019'
  const primaryRatio = contrast(onPrimary, colors.accent)
  checks += 1
  if (primaryRatio < 4.5) failures.push(`${preset}: on-primary/primary ${primaryRatio.toFixed(2)}:1 < 4.5:1`)
}

if (!lightColors) throw new Error('githubLight appearance preset not found')

const lightSemanticPairs = [
  ['on-primary/primary', '#ffffff', lightColors.accent, 4.5],
  ['on-primary/primary-hover', '#ffffff', lightColors.accentHover, 4.5],
  ['on-success/success', '#ffffff', '#0b6a0b', 4.5],
  ['on-danger/error', '#ffffff', '#b42318', 4.5],
  ['success/surface', '#0b6a0b', lightColors.surface, 4.5],
  ['error/surface', '#b42318', lightColors.surface, 4.5],
  ['warning/surface', '#8a5d00', lightColors.surface, 4.5],
  ['tertiary/surface2', '#52657a', lightColors.surface2, 4.5],
]

for (const [label, foreground, background, minimum] of lightSemanticPairs) {
  const ratio = contrast(foreground, background)
  checks += 1
  if (ratio < minimum) failures.push(`githubLight: ${label} ${ratio.toFixed(2)}:1 < ${minimum}:1`)
}

if (failures.length) {
  console.error(failures.join('\n'))
  process.exit(1)
}

console.log(`[contrast] themes=${presets.length}, WCAG pairs=${checks}: ok`)
