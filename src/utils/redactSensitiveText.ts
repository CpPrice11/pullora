export function redactSensitiveText(value: string): string {
  return value
    .replace(/\b(?:github_pat_|gh[pousr]_)[a-z0-9_-]+/gi, '<redacted>')
    .replace(/((?:access_)?token\s*[:=]\s*|authorization\s*:\s*bearer\s+)[^&\s"',}\]]+/gi, '$1<redacted>')
    .replace(/\b([a-z]:[\\/](?:users|documents and settings)[\\/])[^\\/\r\n]+/gi, '$1<user>')
    .replace(/(\/(?:home|Users)\/)[^/\s]+/g, '$1<user>')
}
