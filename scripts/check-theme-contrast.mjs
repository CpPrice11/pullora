import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/utils/theme.ts', import.meta.url), 'utf8')
const palettes = [...source.matchAll(/^  (dark|light): \{\r?\n([\s\S]*?)^  \},?$/gm)]
const surfaces = ['background', 'surface', 'surface2', 'sidebar']
const foregrounds = { text: 4.5, muted: 4.5, accent: 3, accentHover: 3 }

if (palettes.length === 0) throw new Error('No theme palettes found')

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

for (const [, palette, body] of palettes) {
  const colors = Object.fromEntries(
    [...body.matchAll(/^    (\w+): '(#[0-9a-f]{6})',?$/gim)].map((match) => [match[1], match[2]]),
  )

  for (const surface of surfaces) {
    for (const [foreground, minimum] of Object.entries(foregrounds)) {
      const ratio = contrast(colors[foreground], colors[surface])
      checks += 1
      if (ratio < minimum) failures.push(`${palette}: ${foreground}/${surface} ${ratio.toFixed(2)}:1 < ${minimum}:1`)
    }
  }
}

if (failures.length) {
  console.error(failures.join('\n'))
  process.exit(1)
}

console.log(`[contrast] themes=${palettes.length}, WCAG pairs=${checks}: ok`)
