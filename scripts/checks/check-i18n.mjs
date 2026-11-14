import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const languages = ['uk', 'en', 'ru']
const dictionaries = {}
const errors = []

for (const language of languages) {
  const native = JSON.parse(readFileSync(new URL(`../../src/i18n/native/${language}.json`, import.meta.url), 'utf8'))
  const dictionary = new Map(Object.entries(native))
  const source = readFileSync(new URL(`../../src/i18n/dictionaries/${language}.ts`, import.meta.url), 'utf8')
  for (const line of source.split(/\r?\n/)) {
    const entry = line.match(/^\s*'([^']+)':\s*(.+),\s*$/)
    if (!entry) continue
    const [, key, text] = entry
    if (dictionary.has(key)) errors.push(`duplicate ${language}: ${key}`)
    dictionary.set(key, text)
  }
  dictionaries[language] = dictionary
}

const keys = new Set(languages.flatMap(language => [...dictionaries[language].keys()]))
const placeholders = text => [...text.matchAll(/\{\w+\}/g)].map(match => match[0]).sort().join(',')
for (const language of languages) {
  for (const key of keys) {
    const text = dictionaries[language].get(key)
    if (text === undefined) errors.push(`missing ${language}: ${key}`)
    else if (dictionaries.en.has(key) && placeholders(text) !== placeholders(dictionaries.en.get(key))) {
      errors.push(`placeholder mismatch ${language}: ${key}`)
    }
  }
}

function filesIn(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? filesIn(path) : [path]
  })
}

const rustRoot = fileURLToPath(new URL('../../src-tauri/src', import.meta.url))
const rustCodes = new Set(
  filesIn(rustRoot)
    .filter((path) => path.endsWith('.rs'))
    .flatMap((path) => [...readFileSync(path, 'utf8').matchAll(/(?<![\w])command_error(?:_with_detail)?\(\s*"([^"]+)"/g)])
    .map((match) => match[1]),
)

for (const code of rustCodes) {
  if (languages.some(language => !dictionaries[language].has(code))) {
    errors.push(`missing Rust error translation: ${code}`)
  }
}

if (errors.length) {
  console.error(errors.join('\n'))
  process.exit(1)
}

console.log(`[i18n] ${languages.map(language => `${language}=${dictionaries[language].size}`).join(', ')}, duplicates=0, Rust errors=${rustCodes.size}`)
