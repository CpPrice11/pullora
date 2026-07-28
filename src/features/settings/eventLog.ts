export type EventLogLevel = 'info' | 'success' | 'warning' | 'error'

export interface ParsedEventLogEntry {
  timestamp: string | null
  level: EventLogLevel
  source: string
  message: string
  technical: string | null
}

const levelOf = (message: string): EventLogLevel => {
  const value = message.toLowerCase()
  if (/warning|canceled|cancelled|retry|skipped/.test(value)) return 'warning'
  if (/failed|error|not found/.test(value)) return 'error'
  if (/success|installed|launched|recovered|removed|completed/.test(value)) return 'success'
  return 'info'
}

function splitMessage(value: string) {
  const [firstLine = '', ...extraLines] = value.split(/\r?\n/)
  const pathIndex = firstLine.search(/(?:[A-Za-z]:\\|\\\\|\/(?:home|Users|tmp|var)\/)/)
  const message = (pathIndex > 0 ? firstLine.slice(0, pathIndex) : firstLine).trim()
  const technical = [
    ...(pathIndex > 0 ? [firstLine.slice(pathIndex).trim()] : []),
    ...extraLines.map((line) => line.trim()).filter(Boolean),
  ]
  return { message, technical }
}

export function parseEventLogEntry(entry: string): ParsedEventLogEntry {
  const dated = entry.match(/^\[?(\d{4}-\d{2}-\d{2}T\S+?)\]?\s+([\s\S]+)$/)
  const timestamp = dated?.[1] ?? null
  const body = dated?.[2] ?? entry
  const scoped = body.match(/^(install|launch)\s+([^:]+):\s*([\s\S]+)$/i)
  if (scoped) {
    const parsed = splitMessage(scoped[3])
    return {
      timestamp,
      level: levelOf(parsed.message),
      source: scoped[1].toLowerCase(),
      message: parsed.message,
      technical: [scoped[2].trim(), ...parsed.technical].join('\n'),
    }
  }

  const dotted = body.match(/^([a-z][\w-]*)\.([\s\S]+)$/i)
  const source = dotted?.[1]?.toLowerCase() ?? (body.startsWith('startup ') ? 'startup' : 'pullora')
  const parsed = splitMessage(dotted?.[2] ?? body.replace(/^startup\s+/i, ''))
  return {
    timestamp,
    level: levelOf(parsed.message),
    source,
    message: parsed.message,
    technical: parsed.technical.join('\n') || null,
  }
}
