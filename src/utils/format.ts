export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`
}

export function compareVersionTags(left: string, right: string) {
  const parse = (tag: string) => tag.replace(/^v/i, '').split('.').map((part) => Number.parseInt(part, 10) || 0)
  const leftParts = parse(left)
  const rightParts = parse(right)

  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const diff = (leftParts[index] ?? 0) - (rightParts[index] ?? 0)
    if (diff) return diff
  }
  return 0
}
