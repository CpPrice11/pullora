import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const keys = { uk: new Set(), en: new Set() }
const duplicates = { uk: [], en: [] }

for (const language of ['uk', 'en']) {
  const source = readFileSync(new URL(`../src/i18n/dictionaries/${language}.ts`, import.meta.url), 'utf8')
  for (const line of source.split(/\r?\n/)) {
    const key = line.match(/^\s*'([^']+)':/i)?.[1]
    if (!key) continue
    if (keys[language].has(key)) duplicates[language].push(key)
    keys[language].add(key)
  }
}

const missingUk = [...keys.en].filter((key) => !keys.uk.has(key))
const missingEn = [...keys.uk].filter((key) => !keys.en.has(key))
const errors = [
  ...duplicates.uk.map((key) => `duplicate uk: ${key}`),
  ...duplicates.en.map((key) => `duplicate en: ${key}`),
  ...missingUk.map((key) => `missing uk: ${key}`),
  ...missingEn.map((key) => `missing en: ${key}`),
]

function filesIn(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? filesIn(path) : [path]
  })
}

const rustRoot = fileURLToPath(new URL('../src-tauri/src', import.meta.url))
const rustCodes = new Set(
  filesIn(rustRoot)
    .filter((path) => path.endsWith('.rs'))
    .flatMap((path) => [...readFileSync(path, 'utf8').matchAll(/(?<![\w])command_error(?:_with_detail)?\(\s*"([^"]+)"/g)])
    .map((match) => match[1]),
)

for (const code of rustCodes) {
  if (!keys.uk.has(code) || !keys.en.has(code)) errors.push(`missing Rust error translation: ${code}`)
}

if (errors.length) {
  console.error(errors.join('\n'))
  process.exit(1)
}

console.log(`[i18n] uk=${keys.uk.size}, en=${keys.en.size}, duplicates=0, Rust errors=${rustCodes.size}`)
